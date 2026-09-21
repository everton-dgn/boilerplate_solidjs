import { getRequestEvent } from '@solidjs/web'
import { createAPIHandler } from 'filesystem-routing/api'
import routes from 'virtual:file-routes'

type Next = () => Promise<Response>

async function requestTiming(_request: Request, next: Next) {
  const started = performance.now()
  const response = await next()
  response.headers.set(
    'server-timing',
    `app;dur=${(performance.now() - started).toFixed(1)}`
  )
  return response
}

async function securityHeaders(_request: Request, next: Next) {
  const response = await next()
  response.headers.set('x-content-type-options', 'nosniff')
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  return response
}

async function requestContext(_request: Request, next: Next) {
  const event = getRequestEvent()
  if (event) event.locals.requestId = crypto.randomUUID()
  return next()
}

// Rotas com exportações GET, POST etc. respondem antes do SSR; o restante
// segue para a renderização.
const middleware = [
  requestTiming,
  securityHeaders,
  requestContext,
  createAPIHandler(routes)
]

export default middleware
