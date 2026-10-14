import { createAPIMatcher } from 'filesystem-routing/api'
import routes from 'virtual:file-routes'
import { endpoint } from 'virtual:solid-server-function-handler'

import { negotiatePageFormat } from '../negotiatePageFormat/index.ts'

type PagePathOptions = { pathname: string; method: string }

const matchAPI = createAPIMatcher(routes)
const API_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']

export function isServerFunctionPath(pathname: string): boolean {
  return pathname === endpoint || pathname.startsWith(`${endpoint}/`)
}

export function isPagePath({ pathname, method }: PagePathOptions): boolean {
  if (
    isServerFunctionPath(pathname) ||
    /^\/(?:assets|images|favicon)(?:\/|$)/u.test(pathname) ||
    pathname.endsWith('.md') ||
    pathname === '/favicon.ico'
  ) {
    return false
  }
  const matched = matchAPI(pathname, method)
  if (matched) return matched.isPage
  return !API_METHODS.some(
    candidate => matchAPI(pathname, candidate)?.isPage === false
  )
}

// O endpoint de server functions nunca pode receber um segundo dispatch para renderizar erro.
export function isPageRequest(request: Request): boolean {
  const { pathname } = new URL(request.url)
  const accept = request.headers.get('accept')
  return (
    (request.method === 'GET' || request.method === 'HEAD') &&
    negotiatePageFormat(accept) !== undefined &&
    isPagePath({ pathname, method: request.method })
  )
}
