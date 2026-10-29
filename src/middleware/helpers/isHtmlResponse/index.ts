// Só o tipo de mídia text/html conta: text/html-sandboxed ou um parâmetro que
// cite text/html não recebem o nonce nem passam pela conversão para Markdown.
export function isHtmlResponse(response: Response): boolean {
  return /^\s*text\/html\s*(?:;|$)/iu.test(
    response.headers.get('content-type') ?? ''
  )
}
