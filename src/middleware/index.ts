import { createAPIHandler } from 'filesystem-routing/api'
import routes from 'virtual:file-routes'

import { containFailures } from './containFailures/index.ts'
import { requestContext } from './requestContext/index.ts'
import { requestTiming } from './requestTiming/index.ts'
import { securityHeaders } from './securityHeaders/index.ts'
import type { ChainEntry, Middleware } from './types.ts'

// Rotas com exportações GET, POST etc. respondem antes do SSR; o restante
// segue para a renderização.
const requestMiddleware: Middleware[] = [
  requestTiming,
  securityHeaders,
  requestContext,
  createAPIHandler(routes)
]

// Monta a cadeia de produção dentro da contenção. O build E2E passa em extra
// as falhas injetadas, que rodam antes da cadeia e dentro da mesma contenção.
function createMiddleware(extra: Middleware[] = []): ChainEntry {
  return containFailures([...extra, ...requestMiddleware])
}

export { createMiddleware, requestMiddleware }
export default createMiddleware()
