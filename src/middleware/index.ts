import { createAPIHandler } from 'filesystem-routing/api'
import routes from 'virtual:file-routes'

import { containFailures } from './containFailures/index.ts'
import { localizeRequest } from './localizeRequest/index.ts'
import { requestContext } from './requestContext/index.ts'
import { securityHeaders } from './securityHeaders/index.ts'
import type { ChainEntry, Middleware } from './types.ts'

// API por último para receber o contexto e os cabeçalhos de segurança.
const requestMiddleware: Middleware[] = [
  securityHeaders,
  requestContext,
  createAPIHandler(routes)
]

export function createMiddleware(extra: Middleware[] = []): ChainEntry {
  const run = containFailures([...extra, ...requestMiddleware])
  // A contenção da aplicação roda dentro do contexto de idioma, inclusive
  // ao renderizar o fallback. A externa contém falhas da própria resolução.
  const localized: Middleware = (request, next) =>
    localizeRequest({ request, next: () => run(request, next) })
  return containFailures([localized])
}

export default createMiddleware()
