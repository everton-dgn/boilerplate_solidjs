import { createAPIMatcher } from 'filesystem-routing/api'
import routes from 'virtual:file-routes'
import { endpoint } from 'virtual:solid-server-function-handler'

type PagePathOptions = { pathname: string; method: string }

const matchAPI = createAPIMatcher(routes)

export function isServerFunctionPath(pathname: string): boolean {
  return pathname === endpoint || pathname.startsWith(`${endpoint}/`)
}

export function isPagePath({ pathname, method }: PagePathOptions): boolean {
  return (
    !isServerFunctionPath(pathname) &&
    matchAPI(pathname, method)?.isPage !== false
  )
}

// O plugin serve HTML para text/html, */* e ausência de Accept. O endpoint de
// server functions nunca pode receber um segundo dispatch para renderizar erro.
export function isPageRequest(request: Request): boolean {
  const { pathname } = new URL(request.url)
  const accept = request.headers.get('accept')
  return (
    (request.method === 'GET' || request.method === 'HEAD') &&
    (!accept || accept.includes('text/html') || accept.includes('*/*')) &&
    isPagePath({ pathname, method: request.method })
  )
}
