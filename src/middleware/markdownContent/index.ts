import { m } from '@paraglide/messages.js'
import type { StartMiddleware } from '@solidjs/vite-plugin'
import { pageRoutes } from 'virtual:file-routes'

import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_MULTIPLE_CHOICES,
  HTTP_NOT_ACCEPTABLE,
  HTTP_NOT_FOUND,
  HTTP_OK
} from '@/constants/http.ts'
import { LAST_MATCH } from '@/constants/router.ts'
import { isMarkdownRoute, markdownPath } from '@/helpers/markdownRoute/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { delocalizePathname } from '@/i18n/urls/index.ts'
import { PUBLIC_ERROR_MESSAGE } from '@/infra/server/publicErrors/index.ts'
import { Router } from '@/router.ts'

import { appendVary } from '../helpers/appendVary/index.ts'
import { isHtmlResponse } from '../helpers/isHtmlResponse/index.ts'
import { localizeRequest } from '../localizeRequest/index.ts'
import {
  acceptsMarkdown,
  negotiatePageFormat
} from '../negotiatePageFormat/index.ts'
import { isPagePath } from '../requestClassification/index.ts'
import { applySecurityHeaders } from '../securityHeaders/index.ts'
import { MARKDOWN_PRERENDER_PATH, MARKDOWN_TIMEOUT_MS } from './constants.ts'
import { collectStaticMarkdownPages } from './helpers/collectStaticMarkdownPages/index.ts'
import { convertHtml } from './helpers/convertHtml/index.ts'

type Event = Parameters<StartMiddleware>[0]
type Next = Parameters<StartMiddleware>[1]
type RenderOptions = {
  event: Event
  render: Next
  original: Request
  url: URL
  isDirect: boolean
  isPublished: boolean
  signal: AbortSignal
}
type TextOptions = {
  status: number
  body: string | null
  headers: Record<string, string>
}
type Publication = { response: Response; isPublished: boolean }
type RedirectOptions = { response: Response; url: URL; request: Request }
type RouteRequest = { request: Request; url: URL; isPublished: boolean }

const VARY_HEADERS = 'Accept, Cookie, Accept-Language'

function uncachedResponse(response: Response): Response {
  response.headers.set('cache-control', 'private, no-store')
  return applySecurityHeaders({ response, nonce: undefined })
}

function textResponse({ status, body, headers }: TextOptions): Response {
  return uncachedResponse(
    new Response(body, {
      status,
      headers: { 'content-type': 'text/plain; charset=utf-8', ...headers }
    })
  )
}

function publicResponse(status: number): Response {
  return textResponse({
    status,
    body: status === HTTP_INTERNAL_SERVER_ERROR ? PUBLIC_ERROR_MESSAGE : null,
    headers: { vary: VARY_HEADERS }
  })
}

function unpublished(request: Request): Promise<Response> {
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

function notAcceptable(request: Request): Promise<Response> {
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

function documentUrl(request: Request): URL {
  const url = new URL(request.url)
  if (!url.pathname.endsWith('.md')) return url
  const page = url.pathname.slice(0, -'.md'.length)
  const isIndex =
    page.endsWith('/index/index') ||
    delocalizePathname(url.pathname) === '/index.md'
  url.pathname = isIndex ? page.slice(0, -'/index'.length) || '/' : page
  return url
}

function isEligible(url: URL): boolean {
  return (
    isPagePath({ pathname: url.pathname, method: 'GET' }) &&
    isMarkdownRoute(Router.match(url.href).map(match => match.info))
  )
}

function canPublish({ response, isPublished }: Publication): boolean {
  return (
    isPublished && !/noindex/iu.test(response.headers.get('x-robots-tag') ?? '')
  )
}

function canConvert({ response, isPublished }: Publication): boolean {
  if (!isHtmlResponse(response)) return false
  if (response.status === HTTP_NOT_FOUND) return true
  return response.status === HTTP_OK && canPublish({ response, isPublished })
}

function isUnpublished({ request, url, isPublished }: RouteRequest): boolean {
  return (
    request.headers.has('authorization') ||
    (!isPublished &&
      !Router.match(url.href).at(LAST_MATCH)?.pattern.includes('*'))
  )
}

// O prerender do Nitro identifica suas requisições com este header; o build
// grava cada caminho listado como arquivo `.md` estático. Qualquer cliente pode
// enviá-lo: o header não autentica nada, e a lista precisa continuar pública.
function isStaticListing(request: Request): boolean {
  return (
    request.headers.has('x-nitro-prerender') &&
    new URL(request.url).pathname === MARKDOWN_PRERENDER_PATH
  )
}

function listStaticMarkdown(): Response {
  const paths = collectStaticMarkdownPages(pageRoutes)
    .map(path => new URL(resolveSiteUrl(path)))
    .filter(url => isEligible(url))
    .map(url => markdownPath(url.pathname))
  return uncachedResponse(Response.json(paths))
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
    return publicResponse(HTTP_INTERNAL_SERVER_ERROR)
  }
  // A resposta do render já saiu do securityHeaders; falta só o cache.
  const redirect = appendVary({
    response: new Response(response.body, response),
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
  signal.throwIfAborted()
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
    return publicResponse(HTTP_NOT_FOUND)
  }
  const state = event.locals.ssrRenderState
  if (
    isHtmlResponse(response) &&
    response.status === HTTP_INTERNAL_SERVER_ERROR &&
    state?.hasErrors === true
  ) {
    await response.body?.cancel()
    return publicResponse(HTTP_INTERNAL_SERVER_ERROR)
  }
  if (!canConvert({ response, isPublished })) return response
  if (state?.hasCompleted !== true || state.hasErrors !== false) {
    await response.body?.cancel()
    return publicResponse(HTTP_INTERNAL_SERVER_ERROR)
  }
  // A origem pública resolve os links: no prerender a requisição é local.
  const markdown = await convertHtml({
    response,
    url: resolveSiteUrl(`${url.pathname}${url.search}`),
    signal
  })
  const headers = new Headers(response.headers)
  for (const name of ['content-length', 'content-encoding', 'etag']) {
    headers.delete(name)
  }
  headers.set('content-type', 'text/markdown; charset=utf-8')
  if (response.status === HTTP_NOT_FOUND) headers.set('x-robots-tag', 'noindex')
  return uncachedResponse(
    appendVary({
      response: new Response(markdown, { status: response.status, headers }),
      field: 'Accept'
    })
  )
}

async function boundedRender(
  options: Omit<RenderOptions, 'signal'>
): Promise<Response> {
  const { event, original, url } = options
  const controller = new AbortController()
  const signal = AbortSignal.any([original.signal, controller.signal])
  const timeout = setTimeout(() => controller.abort(), MARKDOWN_TIMEOUT_MS)
  const headers = new Headers(original.headers)
  headers.set('accept', 'text/html')
  event.renderMode = 'async'
  event.request = new Request(url, { method: 'GET', headers, signal })
  const aborted = Promise.withResolvers<Response>()
  const onAbort = () => {
    aborted.reject(new Error('Markdown request aborted'))
  }
  try {
    signal.throwIfAborted()
    signal.addEventListener('abort', onAbort, { once: true })
    return await Promise.race([
      renderMarkdown({ ...options, signal }),
      aborted.promise
    ])
  } catch {
    return publicResponse(HTTP_INTERNAL_SERVER_ERROR)
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', onAbort)
  }
}

export async function markdownContent(
  event: Event,
  render: Next
): Promise<Response> {
  const original = event.request
  if (!['GET', 'HEAD'].includes(original.method)) return render()
  if (isStaticListing(original)) return listStaticMarkdown()
  const { pathname } = new URL(original.url)
  if (!isPagePath({ pathname, method: original.method })) return render()
  const url = documentUrl(original)
  const isDirect = pathname.endsWith('.md')
  try {
    decodeURI(url.pathname)
  } catch {
    return publicResponse(HTTP_BAD_REQUEST)
  }
  if (!isPagePath({ pathname: url.pathname, method: original.method })) {
    return publicResponse(HTTP_NOT_FOUND)
  }
  const format = negotiatePageFormat(original.headers.get('accept'))
  const isPublished = isEligible(url)
  if (isDirect && isUnpublished({ request: original, url, isPublished })) {
    return unpublished(original)
  }
  if (
    (isDirect && !acceptsMarkdown(original.headers.get('accept'))) ||
    (!isDirect && isPublished && !format)
  ) {
    return notAcceptable(original)
  }
  if (!isDirect && format !== 'markdown') {
    const response = await render()
    return isPublished ? appendVary({ response, field: 'Accept' }) : response
  }
  if (!isDirect && original.headers.has('authorization')) return render()
  const response = await boundedRender({
    event,
    render,
    original,
    url,
    isDirect,
    isPublished
  })
  if (original.method !== 'HEAD') return response
  await response.body?.cancel()
  return new Response(null, {
    status: response.status,
    headers: response.headers
  })
}
