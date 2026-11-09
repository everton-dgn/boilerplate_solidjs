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

// Depois das rotas de API, só o render recebe a requisição. No build o handler
// do plugin renderiza a página com qualquer método, fora do contexto de idioma
// e com status 200, inclusive num caminho de API sem handler para o método;
// formulários do router enviam ao endpoint das server functions, nunca ao
// caminho da página.
export function restrictPageMethods(
  request: Request,
  next: Next
): Promise<Response> {
  if (PAGE_METHODS.includes(request.method)) return next()
  const { pathname } = new URL(request.url)
  if (isPagePath({ pathname, method: request.method })) {
    return methodNotAllowed(PAGE_METHODS)
  }
  const allowed = apiRouteMethods(pathname)
  return allowed.length > 0 ? methodNotAllowed(allowed) : next()
}
