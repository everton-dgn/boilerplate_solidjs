import type { PrerenderRoute } from 'nitro/types'

import { readRouteBytes } from '../artifactDigest/index.ts'

// Um envelope completo é HTML servido no lugar do Markdown. Um bloco de código
// ou uma citação de tags no meio do texto não abre e fecha o corpo inteiro.
const HTML_DOCUMENT_START = /^\s*(?:<!doctype\s+html\b|<html[\s>])/iu
const HTML_DOCUMENT_END = /<\/html>\s*$/iu
const MARKDOWN_TYPE = 'text/markdown'
const UTF8_CHARSET = 'charset=utf-8'

// O Nitro infere `text/markdown` sem charset quando a resposta não declara
// tipo, como num redirect sem corpo; o adaptador sempre envia o charset.
function isMarkdownUtf8(contentType: string | undefined): boolean {
  const [type, ...parameters] = (contentType ?? '')
    .split(';')
    .map(part => part.trim().toLowerCase().replaceAll('"', ''))
  return type === MARKDOWN_TYPE && parameters.includes(UTF8_CHARSET)
}

// Devolve o problema do artefato gravado para uma URL `.md`, ou undefined
// quando ele é Markdown publicável.
export function inspectMarkdownArtifact(
  route: PrerenderRoute
): string | undefined {
  if (route.fileName !== route.route) {
    return `written as ${route.fileName ?? 'no file'}`
  }
  if (!route.contentType) return 'served as no content type'
  if (!isMarkdownUtf8(route.contentType)) {
    return `served as ${route.contentType}`
  }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(
      readRouteBytes(route)
    )
  } catch {
    return 'invalid UTF-8 body'
  }
  if (!text.trim()) return 'empty body'
  if (HTML_DOCUMENT_START.test(text) && HTML_DOCUMENT_END.test(text)) {
    return 'HTML document body'
  }
  return undefined
}
