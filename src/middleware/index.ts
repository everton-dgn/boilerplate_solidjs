import { composeMiddleware, getRequestEvent } from '@solidjs/web'
import { createAPIHandler, createAPIMatcher } from 'filesystem-routing/api'
import routes from 'virtual:file-routes'

import { logServerFailure } from '@/infra/server/logServerFailure/index.ts'
import {
  createPublicError,
  PUBLIC_ERROR_MESSAGE
} from '@/infra/server/publicErrors/index.ts'

type Next = () => Promise<Response>
type Render = (request?: Request) => Response | Promise<Response>
type Middleware = (request: Request, next: Next) => Promise<Response>
type ChainEntry = (request: Request, next: Render) => Promise<Response>
type RenderState = { rendered: boolean }

const HTTP_INTERNAL_SERVER_ERROR = 500
// Endpoint padrão do @solidjs/vite-plugin; o vite.config.ts não o altera. O
// dispatcher do plugin desvia esse prefixo para as server functions antes do
// render da página.
const SERVER_FUNCTIONS_ENDPOINT = '/_server'
const matchAPIRoute = createAPIMatcher(routes)

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

function isServerFunctionPath(pathname: string): boolean {
  return (
    pathname === SERVER_FUNCTIONS_ENDPOINT ||
    pathname.startsWith(`${SERVER_FUNCTIONS_ENDPOINT}/`)
  )
}

function isAPIRoute(request: Request, pathname: string): boolean {
  const route = matchAPIRoute(pathname, request.method)
  return route !== undefined && !route.isPage
}

// Só uma navegação de página recebe a página de erro do app. Chamar o render
// de novo no endpoint de server functions executaria a função sem os
// middlewares que falharam; rotas de API esperam outro formato.
function isPageRequest(request: Request): boolean {
  const { pathname } = new URL(request.url)
  return (
    (request.method === 'GET' || request.method === 'HEAD') &&
    (request.headers.get('accept') ?? '').includes('text/html') &&
    !isServerFunctionPath(pathname) &&
    !isAPIRoute(request, pathname)
  )
}

function publicTextFailure(): Response {
  return applySecurityHeaders(
    new Response(PUBLIC_ERROR_MESSAGE, {
      status: HTTP_INTERNAL_SERVER_ERROR,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    })
  )
}

// Renderiza o app de novo com o erro público em locals: o gate de App.tsx o
// lança e o Errored raiz mostra o ErrorFallback. O status é forçado porque um
// render descartado pode já ter enviado o início da resposta do evento.
async function renderErrorPage(render: Render): Promise<Response> {
  const event = getRequestEvent()
  if (!event) return publicTextFailure()
  event.locals.serverFailure = createPublicError()
  try {
    const page = await render()
    return applySecurityHeaders(
      new Response(page.body, {
        status: HTTP_INTERNAL_SERVER_ERROR,
        headers: page.headers
      })
    )
  } catch {
    try {
      logServerFailure('error-page')
    } catch {
      // Sem destino de log disponível.
    }
    return publicTextFailure()
  }
}

// Envolve toda a cadeia: uma exceção nos middlewares, nas rotas de API ou no
// handler de páginas vira 500 público com log fixo, em vez de chegar ao host,
// que registraria o erro original. Como a cadeia é composta aqui dentro, o
// next recebido é o render da página, usado para a página de erro. Não cobre
// a criação do evento, o commit da resposta nem falhas do corpo depois que a
// Response sai.
function containFailures(chain: Middleware[]): ChainEntry {
  const run = composeMiddleware(chain)
  return async (request, next) => {
    // O plugin só aceita uma chamada ao render por requisição. Se a cadeia já
    // renderizou a página antes de falhar, a página de erro não é possível.
    const state: RenderState = { rendered: false }
    const render: Render = override => {
      state.rendered = true
      return next(override)
    }
    try {
      return await run(request, render)
    } catch (error) {
      // Em desenvolvimento o erro original segue para o Vite.
      if (import.meta.env.DEV) throw error
      if (isControlResponse(error)) return error
      try {
        logServerFailure('middleware')
      } catch {
        // O log é uma tentativa; a resposta pública sai mesmo sem destino.
      }
      return isPageRequest(request) && !state.rendered
        ? renderErrorPage(next)
        : publicTextFailure()
    }
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
const requestMiddleware: Middleware[] = [
  requestTiming,
  securityHeaders,
  requestContext,
  createAPIHandler(routes)
]

export { containFailures, requestMiddleware }
export default containFailures(requestMiddleware)
