import { composeMiddleware, getRequestEvent } from '@solidjs/web'
import { createAPIMatcher } from 'filesystem-routing/api'
import routes from 'virtual:file-routes'
import { endpoint } from 'virtual:solid-server-function-handler'

import { isControlResponse } from '@/infra/server/isControlResponse/index.ts'
import { logServerFailure } from '@/infra/server/logServerFailure/index.ts'
import {
  createPublicError,
  PUBLIC_ERROR_MESSAGE
} from '@/infra/server/publicErrors/index.ts'

import { applySecurityHeaders, requestNonce } from '../securityHeaders/index.ts'
import type { ChainEntry, Middleware, Render } from '../types.ts'

type RenderState = { rendered: boolean }
type RouteRequest = { request: Request; pathname: string }
type Containment = {
  error: unknown
  request: Request
  next: Render
  rendered: boolean
}

const HTTP_INTERNAL_SERVER_ERROR = 500
const matchAPIRoute = createAPIMatcher(routes)

// O endpoint vem do módulo virtual do @solidjs/vite-plugin, com o
// `serverFunctions.endpoint` e o `base` do Vite já aplicados. O dispatcher do
// plugin importa o mesmo valor e desvia esse prefixo para as server functions
// antes do render da página.
function isServerFunctionPath(pathname: string): boolean {
  return pathname === endpoint || pathname.startsWith(`${endpoint}/`)
}

function isAPIRoute({ request, pathname }: RouteRequest): boolean {
  const route = matchAPIRoute(pathname, request.method)
  return route !== undefined && !route.isPage
}

// Mesmo critério de HTML do plugin: text/html pelo nome, */* ou nenhum Accept
// (curl, monitores). São os pedidos que recebem a página quando nada falha.
function acceptsHtml(request: Request): boolean {
  const accept = request.headers.get('accept')
  return !accept || accept.includes('text/html') || accept.includes('*/*')
}

// Só uma navegação de página recebe a página de erro do app. Chamar o render
// de novo no endpoint de server functions executaria a função sem os
// middlewares que falharam; rotas de API esperam outro formato.
function isPageRequest(request: Request): boolean {
  const { pathname } = new URL(request.url)
  return (
    (request.method === 'GET' || request.method === 'HEAD') &&
    acceptsHtml(request) &&
    !isServerFunctionPath(pathname) &&
    !isAPIRoute({ request, pathname })
  )
}

function publicTextFailure(): Response {
  return applySecurityHeaders({
    response: new Response(PUBLIC_ERROR_MESSAGE, {
      status: HTTP_INTERNAL_SERVER_ERROR,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    }),
    nonce: requestNonce()
  })
}

// Renderiza o app de novo com o erro público em locals: o gate de App.tsx o
// lança e o Errored raiz mostra o ErrorFallback. O status é forçado porque um
// render descartado pode já ter enviado o início da resposta do evento. Uma
// falha anterior ao securityHeaders deixa a requisição sem nonce; ele é criado
// aqui, antes do render, para que os scripts da página e a CSP coincidam.
async function renderErrorPage(render: Render): Promise<Response> {
  const event = getRequestEvent()
  if (!event) return publicTextFailure()
  event.locals.serverFailure = createPublicError()
  const nonce = requestNonce()
  try {
    const page = await render()
    return applySecurityHeaders({
      response: new Response(page.body, {
        status: HTTP_INTERNAL_SERVER_ERROR,
        headers: page.headers
      }),
      nonce
    })
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
// texto.
async function containedResponse({
  error,
  request,
  next,
  rendered
}: Containment): Promise<Response> {
  if (isControlResponse(error)) {
    try {
      // O controle sai com os mesmos headers de uma resposta devolvida.
      return applySecurityHeaders({ response: error, nonce: requestNonce() })
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
  return isPageRequest(request) && !rendered
    ? renderErrorPage(next)
    : publicTextFailure()
}

// Envolve toda a cadeia: uma exceção nos middlewares, nas rotas de API ou no
// handler de páginas vira 500 público com log filtrado, em vez de chegar ao
// host, que registraria o erro original. Como a cadeia é composta aqui dentro,
// o next recebido é o render da página, usado para a página de erro. Não cobre
// a criação do evento, o commit da resposta nem falhas do corpo depois que a
// Response sai.
export function containFailures(chain: Middleware[]): ChainEntry {
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
      return containedResponse({
        error,
        request,
        next,
        rendered: state.rendered
      })
    }
  }
}
