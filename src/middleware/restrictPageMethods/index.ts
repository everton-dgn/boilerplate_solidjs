import { HTTP_METHOD_NOT_ALLOWED } from '@/constants/http.ts'

import { apiRouteMethods, isPagePath } from '../requestClassification/index.ts'
import type { Next } from '../types.ts'

const PAGE_METHODS = ['GET', 'HEAD']

function methodNotAllowed(allowed: string[]): Promise<Response> {
  return Promise.resolve(
    new Response(null, {
      status: HTTP_METHOD_NOT_ALLOWED,
      headers: { allow: allowed.join(', ') }
    })
  )
}

// After the API routes, only the render receives the request. In the build the
// plugin handler renders the page with any method, outside the locale context and
// with status 200, an API path without a handler for the method included; router
// forms submit to the server function endpoint, never to the page path.
export function restrictPageMethods(
  request: Request,
  next: Next
): Promise<Response> {
  const { pathname } = new URL(request.url)
  // The API handler already served the methods that the route exports, so an API
  // path that gets here, even on GET or HEAD, has no handler for the method.
  const apiMethods = apiRouteMethods(pathname)
  if (apiMethods.length > 0) return methodNotAllowed(apiMethods)
  if (PAGE_METHODS.includes(request.method)) return next()
  return isPagePath({ pathname, method: request.method })
    ? methodNotAllowed(PAGE_METHODS)
    : next()
}
