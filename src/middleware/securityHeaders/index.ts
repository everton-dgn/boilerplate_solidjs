import { getRequestEvent } from '@solidjs/web'

import type { Next } from '../types.ts'
import { CSP_DIRECTIVES, SECURITY_HEADERS } from './constants.ts'

type SecurityHeadersUpdate = { response: Response; nonce: string | undefined }
type HeaderUpdate = { response: Response; headers: Record<string, string> }

// 128 bits, o mínimo recomendado para um nonce de CSP.
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

// Só documentos HTML executam scripts. Texto, XML, JSON e redirects saem com
// script-src 'none', e o nonce da requisição não fica guardado no cache
// compartilhado das respostas com s-maxage.
function isHtml(response: Response): boolean {
  const contentType = response.headers.get('content-type') ?? ''
  return contentType.toLowerCase().includes('text/html')
}

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

// Nonce CSP da requisição, criado no primeiro acesso e guardado em locals. O
// securityHeaders o cria antes do render; a contenção lê o mesmo valor ou cria
// um quando a falha veio antes dele. O src/entry-server.tsx o repassa ao
// renderToStream e o Document aos scripts que renderiza. Fora de uma
// requisição não há nonce.
export function requestNonce(): string | undefined {
  const event = getRequestEvent()
  if (!event) return undefined
  event.locals.nonce ??= createNonce()
  return event.locals.nonce
}

// Em desenvolvimento a CSP fica de fora: o Vite injeta no <head> scripts sem
// nonce (cliente de HMR e patch de estilos). Os demais cabeçalhos valem em
// todos os modos.
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
            isHtml(response) ? nonce : undefined
          )
        }
  })
}

// O nonce nasce antes de next(): o render o lê de locals, e a CSP da resposta
// leva o mesmo valor.
// oxlint-disable-next-line eslint/max-params -- A cadeia de middleware impõe a assinatura (request, next).
export async function securityHeaders(
  _request: Request,
  next: Next
): Promise<Response> {
  const nonce = requestNonce()
  return applySecurityHeaders({ response: await next(), nonce })
}
