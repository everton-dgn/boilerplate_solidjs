import { HTTP_METHOD_NOT_ALLOWED } from '@/constants/http.ts'

import { isPagePath } from '../requestClassification/index.ts'
import type { Next } from '../types.ts'

const PAGE_METHODS = ['GET', 'HEAD']

// Depois das rotas de API, só o render recebe a requisição. No build o handler
// do plugin renderiza a página com qualquer método, fora do contexto de idioma
// e com status 200; formulários do router enviam ao endpoint das server
// functions, nunca ao caminho da página.
export function restrictPageMethods(
  request: Request,
  next: Next
): Promise<Response> {
  const { pathname } = new URL(request.url)
  if (
    PAGE_METHODS.includes(request.method) ||
    !isPagePath({ pathname, method: request.method })
  ) {
    return next()
  }
  return Promise.resolve(
    new Response(null, {
      status: HTTP_METHOD_NOT_ALLOWED,
      headers: { allow: PAGE_METHODS.join(', ') }
    })
  )
}
