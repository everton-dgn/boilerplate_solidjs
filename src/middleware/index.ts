import type { StartMiddleware } from '@solidjs/vite-plugin'
import { createAPIHandler } from 'filesystem-routing/api'
import routes from 'virtual:file-routes'

import { containFailures } from './containFailures/index.ts'
import { localizeRequest } from './localizeRequest/index.ts'
import { markdownContent } from './markdownContent/index.ts'
import { restrictPageMethods } from './restrictPageMethods/index.ts'
import { securityHeaders } from './securityHeaders/index.ts'
import type { Middleware } from './types.ts'

// API gets the nonce and the headers before the page negotiation. The method
// restriction comes after the API, which can handle POST on a page.
const requestMiddleware: Middleware[] = [
  securityHeaders,
  createAPIHandler(routes),
  restrictPageMethods
]

export function createMiddleware(extra: Middleware[] = []): StartMiddleware {
  const run = containFailures([...extra, ...requestMiddleware])
  // The application containment runs inside the locale context, including when it
  // renders the fallback. The outer one contains failures of the resolution itself.
  const localized: Middleware = (request, next) =>
    localizeRequest({ request, next: () => run(request, next) })
  const contained = containFailures([localized])
  // The project chain receives a Request; the plugin receives the event.
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
