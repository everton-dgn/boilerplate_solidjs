import { composeMiddleware, getRequestEvent } from '@solidjs/web'
import { createAPIHandler, createAPIMatcher } from 'filesystem-routing/api'
import routes from 'virtual:file-routes'

import { isControlResponse } from '@/infra/server/isControlResponse/index.ts'
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
type HeaderUpdate = { response: Response; headers: Record<string, string> }
type RouteRequest = { request: Request; pathname: string }
type Timing = { response: Response; started: number }
type Containment = {
  error: unknown
  request: Request
  next: Render
  rendered: boolean
  started: number
}

const HTTP_INTERNAL_SERVER_ERROR = 500
// Endpoint padrão do @solidjs/vite-plugin; o vite.config.ts não o altera. O
// dispatcher do plugin desvia esse prefixo para as server functions antes do
// render da página.
const SERVER_FUNCTIONS_ENDPOINT = '/_server'
const matchAPIRoute = createAPIMatcher(routes)

// Uma resposta sem corpo e com headers imutáveis, como Response.redirect(), vai
// numa cópia com o mesmo status e os mesmos headers. Com corpo, ela é o retorno
// cru de fetch(), que carrega dados e headers upstream; o erro segue para a
// contenção.
function withHeaders({ response, headers }: HeaderUpdate): Response {
  try {
    for (const [name, value] of Object.entries(headers)) {
      response.headers.set(name, value)
    }
    return response
  } catch (error) {
    if (response.body !== null) throw error
    const copy = new Response(null, response)
    for (const [name, value] of Object.entries(headers)) {
      copy.headers.set(name, value)
    }
    return copy
  }
}

function applySecurityHeaders(response: Response): Response {
  return withHeaders({
    response,
    headers: {
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    }
  })
}

// Acrescenta a métrica app sem apagar as que o runtime já gravou, como a do
// traceparent.
function serverTiming({ response, started }: Timing): Record<string, string> {
  const metric = `app;dur=${(performance.now() - started).toFixed(1)}`
  const current = response.headers.get('server-timing')
  return { 'server-timing': current ? `${current}, ${metric}` : metric }
}

function isServerFunctionPath(pathname: string): boolean {
  return (
    pathname === SERVER_FUNCTIONS_ENDPOINT ||
    pathname.startsWith(`${SERVER_FUNCTIONS_ENDPOINT}/`)
  )
}

function isAPIRoute({ request, pathname }: RouteRequest): boolean {
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
    !isAPIRoute({ request, pathname })
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
  } catch (error) {
    try {
      logServerFailure({ source: 'error-page', error })
    } catch {
      // Sem destino de log disponível.
    }
    return publicTextFailure()
  }
}

// Resposta da contenção: o controle lançado, a página de erro ou o 500 em
// texto. Ela não volta pelo requestTiming, então o server-timing é gravado aqui.
async function containedResponse({
  error,
  request,
  next,
  rendered,
  started
}: Containment): Promise<Response> {
  if (isControlResponse(error)) {
    try {
      // O controle sai com os mesmos headers de uma resposta devolvida.
      const control = applySecurityHeaders(error)
      return withHeaders({
        response: control,
        headers: serverTiming({ response: control, started })
      })
    } catch {
      // Headers que não aceitam gravação nem cópia (status fora de 200 a 599
      // ou objeto hostil) tornam o controle uma falha.
    }
  }
  try {
    logServerFailure({ source: 'middleware', error })
  } catch {
    // O log é uma tentativa; a resposta pública sai mesmo sem destino.
  }
  const failure =
    isPageRequest(request) && !rendered
      ? await renderErrorPage(next)
      : publicTextFailure()
  return withHeaders({
    response: failure,
    headers: serverTiming({ response: failure, started })
  })
}

// Envolve toda a cadeia: uma exceção nos middlewares, nas rotas de API ou no
// handler de páginas vira 500 público com log filtrado, em vez de chegar ao
// host, que registraria o erro original. Como a cadeia é composta aqui dentro,
// o next recebido é o render da página, usado para a página de erro. Não cobre
// a criação do evento, o commit da resposta nem falhas do corpo depois que a
// Response sai.
function containFailures(chain: Middleware[]): ChainEntry {
  const run = composeMiddleware(chain)
  return async (request, next) => {
    const started = performance.now()
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
      return containedResponse({
        error,
        request,
        next,
        rendered: state.rendered,
        started
      })
    }
  }
}

async function requestTiming(_request: Request, next: Next) {
  const started = performance.now()
  const response = await next()
  return withHeaders({ response, headers: serverTiming({ response, started }) })
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

// Monta a cadeia de produção dentro da contenção. O build E2E passa em extra
// as falhas injetadas, que rodam antes da cadeia e dentro da mesma contenção.
function createMiddleware(extra: Middleware[] = []): ChainEntry {
  return containFailures([...extra, ...requestMiddleware])
}

export { containFailures, createMiddleware, requestMiddleware }
export default createMiddleware()
