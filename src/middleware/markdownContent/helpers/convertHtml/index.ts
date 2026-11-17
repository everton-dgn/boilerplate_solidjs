import { createPlugin, type ElementNode, htmlToMarkdown } from '@mdream/js'
import { filterPlugin, isolateMainPlugin } from '@mdream/js/plugins'

import { EXCLUDED_ELEMENTS, MAX_HTML_BYTES } from '../../constants.ts'

type ConvertOptions = { response: Response; url: string; signal: AbortSignal }

// With a space or a control character before the scheme, mdream resolves the
// value against the public origin.
const UNSAFE_URL = /^(?:javascript|vbscript|data):/iu
// The lone `#` is the neutral target applied to unsafe schemes.
const FRAGMENT_URL = /^#./u

// In these regions mdream emits the link as HTML and already drops those schemes.
const RAW_HTML_REGIONS = new Set([
  'address',
  'dd',
  'details',
  'dl',
  'dt',
  'summary'
])

// Containers in which removing the image leaves no mark in the output. The
// emphases only enter because the mdream patch moves the space out of the
// delimiter. In any other ancestor, the removal can empty a link or bring raw HTML
// to the start of the line.
const PLAIN_CONTAINERS = new Set([
  'article',
  'aside',
  'b',
  'blockquote',
  'body',
  'del',
  'div',
  'em',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'html',
  'i',
  'li',
  'main',
  'ol',
  'p',
  'picture',
  's',
  'section',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul'
])

function isInsideRawHtml({ parent }: ElementNode): boolean {
  if (!parent) return false
  return RAW_HTML_REGIONS.has(parent.name) || isInsideRawHtml(parent)
}

function isInsidePlainContainers({ parent }: ElementNode): boolean {
  if (!parent) return true
  return PLAIN_CONTAINERS.has(parent.name) && isInsidePlainContainers(parent)
}

// mdream shares a frozen object between elements without attributes. It keeps a
// fragment-only target relative, which in llms-full.txt would point to the
// aggregate itself; the plugin resolves it against the source page.
const createCleanupPlugin = (url: string) =>
  createPlugin({
    processAttributes(node) {
      const { name, attributes } = node
      // Reduced to text, the link would make mdream emit an inner heading as raw
      // HTML at the start of the line, where the escaped text turns back into a tag.
      if (
        name === 'a' &&
        UNSAFE_URL.test(attributes.href ?? '') &&
        !isInsideRawHtml(node)
      ) {
        node.attributes = { ...attributes, href: '#' }
      }
      const href = node.attributes.href ?? ''
      if (name === 'a' && FRAGMENT_URL.test(href)) {
        node.attributes = { ...node.attributes, href: new URL(href, url).href }
      }
      if (
        name === 'img' &&
        !attributes.alt?.trim() &&
        !attributes.title?.trim() &&
        isInsidePlainContainers(node)
      ) {
        node.attributes = { ...attributes, 'data-md-exclude': '' }
      }
    }
  })

export async function convertHtml({
  response,
  url,
  signal
}: ConvertOptions): Promise<string> {
  signal.throwIfAborted()
  // The async SSR may already have the whole HTML; this bounds the extra build-up.
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Markdown response has no body')
  const chunks: Uint8Array[] = []
  let bytes = 0
  let cancellation: Promise<void> | undefined
  const cancel = () => {
    cancellation ??= (async () => {
      try {
        await reader.cancel()
      } catch {
        // A cancellation that fails still ends the ownership of this reader.
      }
    })()
    return cancellation
  }
  const onAbort = () => {
    void cancel()
  }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    for (;;) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_HTML_BYTES) {
        throw new Error('Markdown document limit exceeded')
      }
      chunks.push(chunk.value)
    }
  } catch (error) {
    await cancel()
    throw error
  } finally {
    signal.removeEventListener('abort', onAbort)
    if (cancellation) await cancellation
  }
  signal.throwIfAborted()
  const html = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    html.set(chunk, offset)
    offset += chunk.byteLength
  }
  return htmlToMarkdown(new TextDecoder().decode(html), {
    origin: url,
    plugins: [
      isolateMainPlugin(),
      filterPlugin({ exclude: EXCLUDED_ELEMENTS }),
      createCleanupPlugin(url)
    ]
  })
}
