import { createPlugin, type ElementNode, htmlToMarkdown } from '@mdream/js'
import { filterPlugin, isolateMainPlugin } from '@mdream/js/plugins'

import { EXCLUDED_ELEMENTS, MAX_HTML_BYTES } from '../../constants.ts'

type ConvertOptions = { response: Response; url: string; signal: AbortSignal }

// Com espaço ou controle antes do esquema, o mdream resolve o valor pela origem
// pública.
const UNSAFE_URL = /^(?:javascript|vbscript|data):/iu
// O `#` isolado é o destino neutro aplicado aos esquemas inseguros.
const FRAGMENT_URL = /^#./u

// Nessas regiões o mdream emite o link como HTML e já descarta esses esquemas.
const RAW_HTML_REGIONS = new Set([
  'address',
  'dd',
  'details',
  'dl',
  'dt',
  'summary'
])

// Contêineres em que remover a imagem não deixa marca na saída. As ênfases só
// entram porque o patch do mdream move o espaço para fora do delimitador. Em
// qualquer outro ancestral, a remoção pode esvaziar um link ou levar HTML bruto
// ao início da linha.
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

// O mdream compartilha um objeto congelado entre elementos sem atributos. Ele
// mantém relativo um destino só de fragmento, que no llms-full.txt apontaria
// para o próprio agregado; o plugin o resolve pela página de origem.
const createCleanupPlugin = (url: string) =>
  createPlugin({
    processAttributes(node) {
      const { name, attributes } = node
      // Reduzido a texto, o link faria o mdream emitir um título interno como
      // HTML bruto no início da linha, onde o texto escapado volta a ser tag.
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
  // Async SSR may already hold the complete HTML; this limits additional accumulation.
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
        // A failed cancellation still closes ownership of this reader.
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
