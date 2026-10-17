import type { StartMiddleware } from '@solidjs/vite-plugin'
import { createAPIHandler } from 'filesystem-routing/api'
import routes from 'virtual:file-routes'

import { containFailures } from './containFailures/index.ts'
import { localizeRequest } from './localizeRequest/index.ts'
import { markdownContent } from './markdownContent/index.ts'
import { requestContext } from './requestContext/index.ts'
import { securityHeaders } from './securityHeaders/index.ts'
import type { Middleware } from './types.ts'

// API recebe o contexto e os cabeçalhos antes da negociação das páginas.
const requestMiddleware: Middleware[] = [
  securityHeaders,
  requestContext,
  createAPIHandler(routes)
]

export function createMiddleware(extra: Middleware[] = []): StartMiddleware {
  const run = containFailures([...extra, ...requestMiddleware])
  // A contenção da aplicação roda dentro do contexto de idioma, inclusive
  // ao renderizar o fallback. A externa contém falhas da própria resolução.
  const localized: Middleware = (request, next) =>
    localizeRequest({ request, next: () => run(request, next) })
  const contained = containFailures([localized])
  // O filesystem-routing e composeMiddleware recebem Request; o plugin recebe o evento.
  return (event, next) =>
    markdownContent(event, () =>
      contained(event.request, request => {
        if (request) event.request = request
        return next()
      })
    )
}

export default createMiddleware()
