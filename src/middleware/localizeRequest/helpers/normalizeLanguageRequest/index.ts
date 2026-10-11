// O parser gerado ordena os pesos, mas ainda aceita q=0. Filtrar a cópia usada
// na detecção preserva os headers e o corpo da requisição entregue à aplicação.
const LANGUAGE_RANGE =
  /^(?<tag>[a-z]{1,8}(?:-[a-z\d]{1,8})*|\*)(?:\s*;\s*q\s*=\s*(?<quality>0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?$/iu

export function normalizeLanguageRequest(request: Request): Request {
  const original = request.headers.get('accept-language')
  if (!original) return request
  const accepted = original.split(',').flatMap(range => {
    const match = LANGUAGE_RANGE.exec(range.trim())
    const tag = match?.groups?.tag
    const quality = Number(match?.groups?.quality ?? '1')
    return tag && quality > 0 ? [`${tag.toLowerCase()};q=${quality}`] : []
  })
  const headers = new Headers(request.headers)
  headers.set('accept-language', accepted.join(', '))
  return new Request(request.url, { headers })
}
