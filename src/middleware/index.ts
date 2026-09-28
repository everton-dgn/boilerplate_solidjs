import { getRequestEvent } from '@solidjs/web'
import { createAPIHandler } from 'filesystem-routing/api'
import routes from 'virtual:file-routes'

import { logServerFailure } from '@/infra/server/logServerFailure/index.ts'
import { PUBLIC_ERROR_MESSAGE } from '@/infra/server/publicErrors/index.ts'

type Next = () => Promise<Response>

const HTTP_INTERNAL_SERVER_ERROR = 500

function applySecurityHeaders(response: Response): Response {
  response.headers.set('x-content-type-options', 'nosniff')
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  return response
}

function isControlResponse(value: unknown): value is Response {
  try {
    // Só respostas sem corpo passam como controle (redirect/reload), como no
    // wrapper; uma Response com corpo pode carregar dados upstream.
    return value instanceof Response && value.body === null
  } catch {
    // A inspeção de um objeto lançado também pode falhar (getter ou Proxy).
    return false
  }
}

// Primeiro da cadeia: uma exceção nos middlewares, nas rotas de API ou no
// handler de páginas vira 500 com a mensagem pública e um log fixo, em vez de
// chegar ao host, que registraria o erro original. Não cobre a criação do
// evento, o commit da resposta nem falhas do corpo depois que a Response sai.
async function containFailures(_request: Request, next: Next) {
  try {
    return await next()
  } catch (error) {
    // Em desenvolvimento o erro original segue para o Vite.
    if (import.meta.env.DEV) throw error
    if (isControlResponse(error)) return error
    logServerFailure('middleware')
    return applySecurityHeaders(
      new Response(PUBLIC_ERROR_MESSAGE, {
        status: HTTP_INTERNAL_SERVER_ERROR,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      })
    )
  }
}

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
  return applySecurityHeaders(await next())
}

async function requestContext(_request: Request, next: Next) {
  const event = getRequestEvent()
  if (event) event.locals.requestId = crypto.randomUUID()
  return next()
}

// Rotas com exportações GET, POST etc. respondem antes do SSR; o restante
// segue para a renderização.
const middleware = [
  containFailures,
  requestTiming,
  securityHeaders,
  requestContext,
  createAPIHandler(routes)
]

export default middleware
