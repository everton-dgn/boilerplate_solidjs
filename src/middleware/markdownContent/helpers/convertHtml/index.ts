import { createPlugin, type ElementNode, htmlToMarkdown } from '@mdream/js'
import { filterPlugin, isolateMainPlugin } from '@mdream/js/plugins'

import { EXCLUDED_ELEMENTS, MAX_HTML_BYTES } from '../../constants.ts'

type ConvertOptions = { response: Response; url: string; signal: AbortSignal }

// Com espaço ou controle antes do esquema, o mdream resolve o valor pela origem
// pública.
const UNSAFE_URL = /^(?:javascript|vbscript|data):/iu

// Nessas regiões o mdream emite o link como HTML e já descarta esses esquemas.
const RAW_HTML_REGIONS = new Set([
  'address',
  'dd',
  'details',
  'dl',
  'dt',
  'summary'
])

// Contêineres que o mdream converte sem sintaxe em volta do conteúdo. Em
// qualquer outro ancestral, remover a imagem pode esvaziar um link, desfazer
// delimitadores ou levar HTML bruto ao início da linha.
const PLAIN_CONTAINERS = new Set([
  'article',
  'aside',
  'blockquote',
  'body',
  'div',
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
  'li',
  'main',
  'ol',
  'p',
  'picture',
  'section',
  'span',
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

// O mdream compartilha um objeto congelado entre elementos sem atributos.
const cleanupPlugin = createPlugin({
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
  const reader = response.body?.getReader()
  if (!reader) return ''
  const cancel = async () => {
    try {
      await reader.cancel()
    } catch {
      /* O stream pode já ter falhado. */
    }
  }
  const onAbort = () => {
    void cancel()
  }
  signal.addEventListener('abort', onAbort, { once: true })
  const decoder = new TextDecoder()
  let html = ''
  let bytes = 0
  try {
    for (
      let chunk = await reader.read();
      !chunk.done;
      chunk = await reader.read()
    ) {
      signal.throwIfAborted()
      const { value } = chunk
      bytes += value.byteLength
      if (bytes > MAX_HTML_BYTES) {
        throw new Error('Markdown document limit exceeded')
      }
      html += decoder.decode(value, { stream: true })
    }
    signal.throwIfAborted()
    html += decoder.decode()
    return htmlToMarkdown(html, {
      origin: url,
      plugins: [
        isolateMainPlugin(),
        filterPlugin({ exclude: EXCLUDED_ELEMENTS }),
        cleanupPlugin
      ]
    })
  } finally {
    signal.removeEventListener('abort', onAbort)
    await cancel()
    reader.releaseLock()
  }
}
