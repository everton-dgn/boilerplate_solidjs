import type { StartMiddleware } from '@solidjs/vite-plugin'
import { createAPIHandler } from 'filesystem-routing/api'
import routes from 'virtual:file-routes'

import { containFailures } from './containFailures/index.ts'
import { localizeRequest } from './localizeRequest/index.ts'
import { markdownContent } from './markdownContent/index.ts'
import { restrictPageMethods } from './restrictPageMethods/index.ts'
import { securityHeaders } from './securityHeaders/index.ts'
import type { Middleware } from './types.ts'

// API recebe o nonce e os cabeçalhos antes da negociação das páginas. A
// restrição de métodos vem depois da API, que pode tratar POST numa página.
const requestMiddleware: Middleware[] = [
  securityHeaders,
  createAPIHandler(routes),
  restrictPageMethods
]

export function createMiddleware(extra: Middleware[] = []): StartMiddleware {
  const run = containFailures([...extra, ...requestMiddleware])
  // A contenção da aplicação roda dentro do contexto de idioma, inclusive
  // ao renderizar o fallback. A externa contém falhas da própria resolução.
  const localized: Middleware = (request, next) =>
    localizeRequest({ request, next: () => run(request, next) })
  const contained = containFailures([localized])
  // A cadeia do projeto recebe Request; o plugin recebe o evento.
  return (event, next) => {
    let hasEnteredLocalizedChain = false
    const markdown: Middleware = (_request, render) =>
      markdownContent(event, () => {
        hasEnteredLocalizedChain = true
        return contained(event.request, request => {
          if (request) event.request = request
          return render()
        })
      })
    return containFailures([markdown])(event.request, () => {
      if (hasEnteredLocalizedChain) return next()
      return localizeRequest({ request: event.request, next })
    })
  }
}

export default createMiddleware()
