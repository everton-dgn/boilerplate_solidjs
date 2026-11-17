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
type Failure = { error: unknown; request: Request }

// The abandoned render rejects with the reason of the signal itself. Only that
// value is a cancellation: another error is a real failure, even with the signal
// aborted.
function isCancellation({ error, request }: Failure): boolean {
  const { signal } = request
  return signal.aborted && Object.is(error, signal.reason)
}

function publicTextFailure(): Response {
  return applySecurityHeaders(
    new Response(publicErrorMessage(), {
      status: HTTP_INTERNAL_SERVER_ERROR,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    })
  )
}

// Forces the status: a disposed render may have started the response.
async function renderErrorPage(render: Render): Promise<Response> {
  const event = getRequestEvent()
  if (!event) return publicTextFailure()
  event.locals.serverFailure = createPublicError()
  // The render reads the nonce from the event; the CSP of the error page uses the same value.
  requestNonce()
  try {
    const page = await render()
    // With the forced status, a locale redirect would go out with Location and without a body.
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
    // The render reads the signal from the event, and the original failure was already logged.
    if (!isCancellation({ error, request: event.request })) {
      logServerFailure({ source: 'error-page', error })
    }
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
      // Headers that accept neither a write nor a copy (a status outside 200 to
      // 599 or a hostile object) make the control a failure.
    }
  }
  if (isCancellation({ error, request })) return publicTextFailure()
  logServerFailure({ source: 'middleware', error })
  return isPageRequest(request) && !isRendered
    ? renderErrorPage(next)
    : publicTextFailure()
}

// Contains failures before the host logs the original error. Does not cover the body after the Response.
export function containFailures(chain: Middleware[]): ChainEntry {
  const run = composeMiddleware(chain)
  return async (request, next) => {
    // The plugin only accepts one render call per request. If the chain already
    // rendered the page before failing, the error page is not possible.
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
