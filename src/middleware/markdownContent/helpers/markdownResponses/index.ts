import { m } from '@paraglide/messages.js'
import { extractLocaleFromRequest } from '@paraglide/runtime.js'

import {
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_NOT_ACCEPTABLE,
  HTTP_NOT_FOUND,
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE
} from '@/constants/http.ts'
import { LLMS_DESCRIBEDBY_LINK } from '@/constants/llms.ts'
import { publicErrorMessage } from '@/infra/server/publicErrors/index.ts'

import { localizeRequest } from '../../../localizeRequest/index.ts'
import { uncachedResponse } from '../uncachedResponse/index.ts'

type NormalizeOptions = { response: Response; request: Request }
type TextOptions = {
  status: number
  body: string | null
  headers: Record<string, string>
}
type PublicOptions = { status: number; request: Request }

const VARY_HEADERS = 'Accept, Cookie, Accept-Language'

function textResponse({ status, body, headers }: TextOptions): Response {
  return uncachedResponse(
    new Response(body, {
      status,
      headers: { 'content-type': 'text/plain; charset=utf-8', ...headers }
    })
  )
}

// O adaptador roda fora do contexto de idioma do paraglide; o idioma da
// mensagem vem da requisição original, na ordem do localizeRequest.
export function publicResponse({ status, request }: PublicOptions): Response {
  return textResponse({
    status,
    body:
      status === HTTP_INTERNAL_SERVER_ERROR
        ? publicErrorMessage(extractLocaleFromRequest(request))
        : null,
    headers: { vary: VARY_HEADERS }
  })
}

export function unpublished(request: Request): Promise<Response> {
  return localizeRequest({
    request,
    next: () =>
      Promise.resolve(
        textResponse({
          status: HTTP_NOT_FOUND,
          body: request.method === 'HEAD' ? null : m.notFound_description(),
          headers: { 'x-robots-tag': 'noindex' }
        })
      )
  })
}

export function notAcceptable(request: Request): Promise<Response> {
  return localizeRequest({
    request,
    next: () =>
      Promise.resolve(
        textResponse({
          status: HTTP_NOT_ACCEPTABLE,
          body: request.method === 'HEAD' ? null : 'text/html\ntext/markdown\n',
          headers: { vary: VARY_HEADERS }
        })
      )
  })
}

// Só o Markdown publicado com sucesso anuncia o índice; o append preserva os
// valores de Link herdados do render.
export function markdownHeaders(response: Response): Headers {
  const headers = new Headers(response.headers)
  for (const name of ['content-length', 'content-encoding', 'etag']) {
    headers.delete(name)
  }
  headers.set('content-type', 'text/markdown; charset=utf-8')
  if (response.status === HTTP_OK) headers.append('link', LLMS_DESCRIBEDBY_LINK)
  if (response.status === HTTP_NOT_FOUND) headers.set('x-robots-tag', 'noindex')
  return headers
}

export async function normalizePublication({
  response,
  request
}: NormalizeOptions): Promise<Response> {
  let result = response
  if (
    response.status === HTTP_INTERNAL_SERVER_ERROR &&
    !response.headers.has('content-type')
  ) {
    result = publicResponse({ status: HTTP_INTERNAL_SERVER_ERROR, request })
  }
  if (
    response.status === HTTP_SERVICE_UNAVAILABLE &&
    response.headers.has('retry-after')
  ) {
    uncachedResponse(response)
  }
  if (request.method !== 'HEAD') return result
  await result.body?.cancel()
  return new Response(null, {
    status: result.status,
    headers: result.headers
  })
}
