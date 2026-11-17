import { getRequestEvent } from '@solidjs/web'

import { isHtmlResponse } from '../helpers/isHtmlResponse/index.ts'
import type { Next } from '../types.ts'
import { CSP_DIRECTIVES, SECURITY_HEADERS } from './constants.ts'

type HeaderUpdate = { response: Response; headers: Record<string, string> }

const NONCE_BYTES = 16

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
  return btoa(String.fromCodePoint(...bytes))
}

// With the nonce, only the scripts that carry it run, and 'strict-dynamic' allows
// the modules they load. Without a nonce, no script runs.
function contentSecurityPolicy(nonce: string | undefined): string {
  const scriptSrc = nonce
    ? `script-src 'nonce-${nonce}' 'strict-dynamic'`
    : "script-src 'none'"
  return [...CSP_DIRECTIVES, scriptSrc].join('; ')
}

// Control responses accept a header copy; an upstream body requires containment.
function withHeaders({ response, headers }: HeaderUpdate): Response {
  try {
    for (const [name, value] of Object.entries(headers)) {
      response.headers.set(name, value)
    }
    return response
  } catch (error) {
    if (response.body !== null) throw error
    const copy = new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    })
    for (const [name, value] of Object.entries(headers)) {
      copy.headers.set(name, value)
    }
    return copy
  }
}

export function requestNonce(): string | undefined {
  const event = getRequestEvent()
  if (!event) return undefined
  event.nonce ??= createNonce()
  const nonce =
    typeof event.nonce === 'string' ? event.nonce : event.nonce.script
  return nonce === false ? undefined : nonce
}

// Development uses the inline HMR styles; the production policy only allows
// external stylesheets. Only HTML documents run scripts. Text, XML, JSON and
// redirects go out with script-src 'none', and the nonce of the request does not
// stay in the shared cache of the responses with s-maxage.
export function applySecurityHeaders(response: Response): Response {
  return withHeaders({
    response,
    headers: import.meta.env.DEV
      ? SECURITY_HEADERS
      : {
          ...SECURITY_HEADERS,
          'content-security-policy': contentSecurityPolicy(
            isHtmlResponse(response) ? requestNonce() : undefined
          )
        }
  })
}

// The nonce is created before next(): the render reads it from the event, and the
// CSP of the response carries the same value.
export async function securityHeaders(
  _request: Request,
  next: Next
): Promise<Response> {
  requestNonce()
  return applySecurityHeaders(await next())
}
