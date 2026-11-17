// Only the text/html media type counts: text/html-sandboxed or a parameter that
// cites text/html neither get the nonce nor go through the Markdown conversion.
export function isHtmlResponse(response: Response): boolean {
  return /^\s*text\/html\s*(?:;|$)/iu.test(
    response.headers.get('content-type') ?? ''
  )
}
