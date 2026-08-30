import { getRequestEvent } from '@solidjs/web'

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

const middleware = [requestTiming, securityHeaders, requestContext]

export default middleware
