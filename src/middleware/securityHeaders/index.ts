import { getRequestEvent } from '@solidjs/web'

import { isHtmlResponse } from '../helpers/isHtmlResponse/index.ts'
import type { Next } from '../types.ts'
import { CSP_DIRECTIVES, SECURITY_HEADERS } from './constants.ts'

type SecurityHeadersUpdate = { response: Response; nonce: string | undefined }
type HeaderUpdate = { response: Response; headers: Record<string, string> }

const NONCE_BYTES = 16

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
  return btoa(String.fromCodePoint(...bytes))
}

// Com o nonce, só os scripts que o trazem rodam, e 'strict-dynamic' libera os
// módulos que eles carregam. Sem nonce, nenhum script roda.
function contentSecurityPolicy(nonce: string | undefined): string {
  const scriptSrc = nonce
    ? `script-src 'nonce-${nonce}' 'strict-dynamic'`
    : "script-src 'none'"
  return [...CSP_DIRECTIVES, scriptSrc].join('; ')
}

// Respostas de controle aceitam cópia de headers; um corpo upstream exige contenção.
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

export function requestNonce(): string | undefined {
  const event = getRequestEvent()
  if (!event) return undefined
  event.nonce ??= createNonce()
  const nonce =
    typeof event.nonce === 'string' ? event.nonce : event.nonce.script
  return nonce === false ? undefined : nonce
}

// O desenvolvimento usa estilos inline do HMR; a política de produção só permite folhas externas.
// Só documentos HTML executam scripts. Texto, XML, JSON e redirects saem com
// script-src 'none', e o nonce da requisição não fica guardado no cache
// compartilhado das respostas com s-maxage.
export function applySecurityHeaders({
  response,
  nonce
}: SecurityHeadersUpdate): Response {
  return withHeaders({
    response,
    headers: import.meta.env.DEV
      ? SECURITY_HEADERS
      : {
          ...SECURITY_HEADERS,
          'content-security-policy': contentSecurityPolicy(
            isHtmlResponse(response) ? nonce : undefined
          )
        }
  })
}

// O nonce nasce antes de next(): o render o lê do evento, e a CSP da resposta
// leva o mesmo valor.
export async function securityHeaders(
  _request: Request,
  next: Next
): Promise<Response> {
  const nonce = requestNonce()
  return applySecurityHeaders({ response: await next(), nonce })
}
