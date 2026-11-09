import type { RequestEvent } from '@solidjs/web'

import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_MULTIPLE_CHOICES,
  HTTP_NOT_FOUND,
  HTTP_OK
} from '@/constants/http.ts'
import { markdownPath } from '@/helpers/markdownRoute/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { logServerFailure } from '@/infra/server/logServerFailure/index.ts'

import { appendVary } from '../../../helpers/appendVary/index.ts'
import { isHtmlResponse } from '../../../helpers/isHtmlResponse/index.ts'
import type { Next } from '../../../types.ts'
import { MAX_MARKDOWN_BYTES } from '../../constants.ts'
import { convertHtml } from '../convertHtml/index.ts'
import { markdownHeaders, publicResponse } from '../markdownResponses/index.ts'
import { isEligible } from '../markdownRouting/index.ts'
import { uncachedResponse } from '../uncachedResponse/index.ts'

type RenderOptions = {
  event: RequestEvent
  render: Next
  original: Request
  url: URL
  isDirect: boolean
  isPublished: boolean
  signal: AbortSignal
}
type ConvertOptions = { response: Response; url: URL; signal: AbortSignal }
type DiscardOptions = { response: Response; signal: AbortSignal }
type Publication = { response: Response; isPublished: boolean }
type RedirectOptions = { response: Response; url: URL; request: Request }

// none equivale a noindex, nofollow; em max-image-preview, só limita a prévia.
const NOINDEX = /(?<!max-image-preview\s*:\s*)\b(?:noindex|none)\b/iu

function canPublish({ response, isPublished }: Publication): boolean {
  return (
    isPublished && !NOINDEX.test(response.headers.get('x-robots-tag') ?? '')
  )
}

function canConvert({ response, isPublished }: Publication): boolean {
  if (!isHtmlResponse(response)) return false
  if (response.status === HTTP_NOT_FOUND) return true
  return response.status === HTTP_OK && canPublish({ response, isPublished })
}

async function resolveRedirect({
  response,
  url,
  request
}: RedirectOptions): Promise<Response> {
  // Nitro aceita redirects no prerender, mas o arquivo perde o status HTTP. Um
  // cliente comum que envie o header só troca o redirect por 500 público.
  if (request.headers.has('x-nitro-prerender')) {
    await response.body?.cancel()
    return publicResponse({ status: HTTP_INTERNAL_SERVER_ERROR, request })
  }
  // A resposta do render já saiu do securityHeaders; falta só o cache.
  const redirect = appendVary({
    response: new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    }),
    field: 'Accept'
  })
  redirect.headers.set('cache-control', 'private, no-store')
  const location = response.headers.get('location')
  if (!location) return redirect
  const target = new URL(location, url)
  if (
    target.origin !== url.origin ||
    target.username ||
    target.password ||
    target.pathname.startsWith('//') ||
    target.pathname.endsWith('.md') ||
    !isEligible(target)
  ) {
    return redirect
  }
  target.pathname = markdownPath(target.pathname)
  redirect.headers.set(
    'location',
    `${target.pathname}${target.search}${target.hash}`
  )
  return redirect
}

async function discardAbortedRender({
  response,
  signal
}: DiscardOptions): Promise<void> {
  if (!signal.aborted) return
  await response.body?.cancel()
  signal.throwIfAborted()
}

async function convertPage({
  response,
  url,
  signal
}: ConvertOptions): Promise<string> {
  // A origem pública resolve os links: no prerender a requisição é local.
  const markdown = await convertHtml({
    response,
    url: resolveSiteUrl(`${url.pathname}${url.search}`),
    signal
  })
  if (new TextEncoder().encode(markdown).byteLength > MAX_MARKDOWN_BYTES) {
    throw new Error('Markdown output limit exceeded')
  }
  return markdown
}

async function renderMarkdown({
  event,
  render,
  original,
  url,
  isDirect,
  isPublished,
  signal
}: RenderOptions): Promise<Response> {
  const response = await render()
  await discardAbortedRender({ response, signal })
  if (
    response.status >= HTTP_MULTIPLE_CHOICES &&
    response.status < HTTP_BAD_REQUEST
  ) {
    return isDirect
      ? resolveRedirect({ response, url, request: original })
      : response
  }
  if (
    isDirect &&
    response.status === HTTP_OK &&
    !canPublish({ response, isPublished })
  ) {
    await response.body?.cancel()
    return publicResponse({ status: HTTP_NOT_FOUND, request: original })
  }
  const state = event.locals.ssrRenderState
  if (
    isHtmlResponse(response) &&
    response.status === HTTP_INTERNAL_SERVER_ERROR &&
    state?.hasErrors === true
  ) {
    await response.body?.cancel()
    return publicResponse({
      status: HTTP_INTERNAL_SERVER_ERROR,
      request: original
    })
  }
  if (!canConvert({ response, isPublished })) return response
  if (state?.hasCompleted !== true || state.hasErrors !== false) {
    await response.body?.cancel()
    return publicResponse({
      status: HTTP_INTERNAL_SERVER_ERROR,
      request: original
    })
  }
  let markdown: string
  try {
    markdown = await convertPage({ response, url, signal })
  } catch (error) {
    // O cancelamento segue para a publicação; os tetos e as falhas do
    // conversor viram o 500 público no idioma da requisição original.
    signal.throwIfAborted()
    logServerFailure({ source: 'middleware', error })
    return publicResponse({
      status: HTTP_INTERNAL_SERVER_ERROR,
      request: original
    })
  }
  const converted = new Response(markdown, {
    status: response.status,
    headers: markdownHeaders(response)
  })
  return uncachedResponse(appendVary({ response: converted, field: 'Accept' }))
}

export function boundedRender({
  signal,
  ...options
}: RenderOptions): Promise<Response> {
  const { event, original, url } = options
  const headers = new Headers(original.headers)
  headers.set('accept', 'text/html')
  event.renderMode = 'async'
  event.request = new Request(url, { method: 'GET', headers, signal })
  return renderMarkdown({ ...options, signal })
}
