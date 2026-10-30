import { composeMiddleware, getRequestEvent } from '@solidjs/web'

import { HTTP_INTERNAL_SERVER_ERROR } from '@/constants/http.ts'
import { isControlResponse } from '@/infra/server/isControlResponse/index.ts'
import { logServerFailure } from '@/infra/server/logServerFailure/index.ts'
import {
  createPublicError,
  publicErrorMessage
} from '@/infra/server/publicErrors/index.ts'

import { isHtmlResponse } from '../helpers/isHtmlResponse/index.ts'
import { isPageRequest } from '../requestClassification/index.ts'
import { applySecurityHeaders, requestNonce } from '../securityHeaders/index.ts'
import type { Middleware } from '../types.ts'

type Render = (request?: Request) => Response | Promise<Response>
type ChainEntry = (request: Request, next: Render) => Promise<Response>
type Containment = {
  error: unknown
  request: Request
  next: Render
  isRendered: boolean
}

function publicTextFailure(): Response {
  return applySecurityHeaders(
    new Response(publicErrorMessage(), {
      status: HTTP_INTERNAL_SERVER_ERROR,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    })
  )
}

// Força o status: um render descartado pode ter iniciado a resposta.
async function renderErrorPage(render: Render): Promise<Response> {
  const event = getRequestEvent()
  if (!event) return publicTextFailure()
  event.locals.serverFailure = createPublicError()
  // O render lê o nonce do evento; a CSP da página de erro usa o mesmo valor.
  requestNonce()
  try {
    const page = await render()
    // Com o status forçado, um redirect de idioma sairia com Location e sem corpo.
    if (!isHtmlResponse(page)) {
      await page.body?.cancel()
      return publicTextFailure()
    }
    return applySecurityHeaders(
      new Response(page.body, {
        status: HTTP_INTERNAL_SERVER_ERROR,
        headers: page.headers
      })
    )
  } catch (error) {
    logServerFailure({ source: 'error-page', error })
    return publicTextFailure()
  }
}

async function containedResponse({
  error,
  request,
  next,
  isRendered
}: Containment): Promise<Response> {
  if (isControlResponse(error)) {
    try {
      return applySecurityHeaders(error)
    } catch {
      // Headers que não aceitam gravação nem cópia (status fora de 200 a 599
      // ou objeto hostil) tornam o controle uma falha.
    }
  }
  logServerFailure({ source: 'middleware', error })
  return isPageRequest(request) && !isRendered
    ? renderErrorPage(next)
    : publicTextFailure()
}

// Contém falhas antes que o host registre o erro original. Não cobre o corpo após a Response.
export function containFailures(chain: Middleware[]): ChainEntry {
  const run = composeMiddleware(chain)
  return async (request, next) => {
    // O plugin só aceita uma chamada ao render por requisição. Se a cadeia já
    // renderizou a página antes de falhar, a página de erro não é possível.
    let isRendered = false
    const render: Render = override => {
      isRendered = true
      return next(override)
    }
    try {
      return await run(request, render)
    } catch (error) {
      if (import.meta.env.DEV) throw error
      return containedResponse({
        error,
        request,
        next,
        isRendered
      })
    }
  }
}
