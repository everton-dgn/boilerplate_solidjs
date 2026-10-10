import { createAPIHandler } from 'filesystem-routing/api'
import routes from 'virtual:file-routes'

import { containFailures } from './containFailures/index.ts'
import { localizeRequest } from './localizeRequest/index.ts'
import { requestContext } from './requestContext/index.ts'
import { securityHeaders } from './securityHeaders/index.ts'
import type { ChainEntry, Middleware } from './types.ts'

// Rotas com exportações GET, POST etc. respondem antes do SSR; o restante
// segue para a renderização. O handler de API fica por último para que as
// respostas dele recebam os cabeçalhos de segurança e o contexto.
const requestMiddleware: Middleware[] = [
  securityHeaders,
  requestContext,
  createAPIHandler(routes)
]

// Monta a cadeia de produção dentro da contenção. O build E2E passa em extra
// as falhas injetadas, que rodam antes da cadeia e dentro da mesma contenção.
export function createMiddleware(extra: Middleware[] = []): ChainEntry {
  const run = containFailures([...extra, ...requestMiddleware])
  // A contenção da aplicação roda dentro do contexto de idioma, inclusive
  // ao renderizar o fallback. A externa contém falhas da própria resolução.
  const localized: Middleware = (request, next) =>
    localizeRequest({ request, next: () => run(request, next) })
  return containFailures([localized])
}

export default createMiddleware()
