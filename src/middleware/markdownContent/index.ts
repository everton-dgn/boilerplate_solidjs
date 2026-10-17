import { m } from '@paraglide/messages.js'
import type { StartMiddleware } from '@solidjs/vite-plugin'
import { pageRoutes } from 'virtual:file-routes'

import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_NOT_ACCEPTABLE,
  HTTP_NOT_FOUND,
  HTTP_OK
} from '@/constants/http.ts'
import { isMarkdownRoute, markdownPath } from '@/helpers/markdownRoute/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { delocalizePathname } from '@/i18n/urls/index.ts'
import { PUBLIC_ERROR_MESSAGE } from '@/infra/server/publicErrors/index.ts'
import { Router } from '@/router.ts'

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
  isDirect: boolean
  signal: AbortSignal
}
const LAST_MATCH = -1
const REDIRECT_START = 300

type RedirectOptions = { response: Response; url: URL }
type RedirectContext = RedirectOptions & { request: Request }
type RouteRequest = { request: Request; url: URL }

function unpublished(request: Request): Promise<Response> {
  return localizeRequest({
    request,
    next: () => {
      const body = request.method === 'HEAD' ? null : m.notFound_description()
      const response = new Response(body, {
        status: HTTP_NOT_FOUND,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'private, no-store',
          'x-robots-tag': 'noindex'
        }
      })
      return Promise.resolve(
        applySecurityHeaders({ response, nonce: undefined })
      )
    }
  })
}

function isHtml(response: Response): boolean {
  return (
    response.headers
      .get('content-type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase() === 'text/html'
  )
}

function documentUrl(request: Request): URL {
  const url = new URL(request.url)
  if (url.pathname.endsWith('/index/index.md')) {
    url.pathname = url.pathname.slice(0, -'/index.md'.length)
    return url
  }
  if (url.pathname.endsWith('.md')) {
    url.pathname =
      delocalizePathname(url.pathname) === '/index.md'
        ? url.pathname.slice(0, -'/index.md'.length) || '/'
        : url.pathname.slice(0, -'.md'.length)
  }
  return url
}

function isEligible(url: URL): boolean {
  return (
    isPagePath({ pathname: url.pathname, method: 'GET' }) &&
    isMarkdownRoute(Router.match(url.href).map(match => match.info))
  )
}

function canPublish({ response, url }: RedirectOptions): boolean {
  return (
    isEligible(url) &&
    !/noindex/iu.test(response.headers.get('x-robots-tag') ?? '')
  )
}

function canConvert({ response, url }: RedirectOptions): boolean {
  if (!isHtml(response)) return false
  if (response.status === HTTP_NOT_FOUND) return true
  return response.status === HTTP_OK && canPublish({ response, url })
}

function isUnpublished({ request, url }: RouteRequest): boolean {
  return (
    request.headers.has('authorization') ||
    (!isEligible(url) &&
      !Router.match(url.href).at(LAST_MATCH)?.pattern.includes('*'))
  )
}

function publicResponse(status: number): Response {
  return applySecurityHeaders({
    response: new Response(
      status === HTTP_INTERNAL_SERVER_ERROR ? PUBLIC_ERROR_MESSAGE : null,
      {
        status,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'private, no-store',
          vary: 'Accept, Cookie, Accept-Language'
        }
      }
    ),
    nonce: undefined
  })
}

// O prerender do Nitro identifica suas requisições com este header; o build
// grava cada caminho listado como arquivo `.md` estático.
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
  return applySecurityHeaders({
    response: Response.json(paths, {
      headers: { 'cache-control': 'private, no-store' }
    }),
    nonce: undefined
  })
}

function notAcceptable(request: Request): Promise<Response> {
  return localizeRequest({
    request,
    next: () => {
      const response = publicResponse(HTTP_NOT_ACCEPTABLE)
      const body =
        request.method === 'HEAD' ? null : 'text/html\ntext/markdown\n'
      return Promise.resolve(
        new Response(body, {
          status: response.status,
          headers: response.headers
        })
      )
    }
  })
}

function varyAccept(response: Response): Response {
  const vary = response.headers.get('vary')
  if (
    !vary
      ?.split(',')
      .some(value => ['*', 'accept'].includes(value.trim().toLowerCase()))
  ) {
    response.headers.set('vary', vary ? `${vary}, Accept` : 'Accept')
  }
  return response
}

async function resolveRedirect({
  response,
  url,
  request
}: RedirectContext): Promise<Response> {
  if (request.headers.has('x-nitro-prerender')) {
    // Nitro aceita redirects no prerender, mas o arquivo perde o status HTTP.
    await response.body?.cancel()
    return publicResponse(HTTP_INTERNAL_SERVER_ERROR)
  }
  const headers = new Headers(response.headers)
  headers.set('cache-control', 'private, no-store')
  const redirect = varyAccept(
    new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  )
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
  isDirect,
  signal
}: RenderOptions): Promise<Response> {
  const response = await render()
  signal.throwIfAborted()
  const url = new URL(event.request.url)
  if (response.status >= REDIRECT_START && response.status < HTTP_BAD_REQUEST) {
    return isDirect
      ? resolveRedirect({ response, url, request: event.request })
      : response
  }
  const isNotFound = response.status === HTTP_NOT_FOUND

  if (
    isDirect &&
    response.status === HTTP_OK &&
    !canPublish({ response, url })
  ) {
    await response.body?.cancel()
    return publicResponse(HTTP_NOT_FOUND)
  }
  const state = event.locals.ssrRenderState
  if (
    isHtml(response) &&
    response.status === HTTP_INTERNAL_SERVER_ERROR &&
    state?.hasErrors === true
  ) {
    await response.body?.cancel()
    return publicResponse(HTTP_INTERNAL_SERVER_ERROR)
  }
  if (!canConvert({ response, url })) return response
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
  headers.set('cache-control', 'private, no-store')
  if (isNotFound) headers.set('x-robots-tag', 'noindex')
  return applySecurityHeaders({
    response: varyAccept(
      new Response(markdown, {
        status: response.status,
        headers
      })
    ),
    nonce: undefined
  })
}

async function boundedRender(
  options: Omit<RenderOptions, 'signal'>
): Promise<Response> {
  const controller = new AbortController()
  const signal = AbortSignal.any([options.original.signal, controller.signal])
  const timeout = setTimeout(() => controller.abort(), MARKDOWN_TIMEOUT_MS)
  const { request } = options.event
  options.event.request = new Request(request, { signal })
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
  const originalUrl = new URL(original.url)
  const url = documentUrl(original)
  if (
    !isPagePath({ pathname: originalUrl.pathname, method: original.method })
  ) {
    return render()
  }
  const isDirect = originalUrl.pathname.endsWith('.md')
  try {
    decodeURI(url.pathname)
  } catch {
    return publicResponse(HTTP_BAD_REQUEST)
  }
  if (!isPagePath({ pathname: url.pathname, method: original.method })) {
    return publicResponse(HTTP_NOT_FOUND)
  }
  const format = negotiatePageFormat(original.headers.get('accept'))
  if (isDirect && isUnpublished({ request: original, url })) {
    return unpublished(original)
  }
  const isPublished = isEligible(url)
  if (
    (isDirect && !acceptsMarkdown(original.headers.get('accept'))) ||
    (!isDirect && isPublished && !format)
  ) {
    return notAcceptable(original)
  }
  if (!isDirect && format !== 'markdown') {
    const response = await render()
    return isPublished ? varyAccept(response) : response
  }
  if (!isDirect && original.headers.has('authorization')) return render()
  event.renderMode = 'async'
  const headers = new Headers(original.headers)
  headers.set('accept', 'text/html')
  event.request = new Request(url, {
    method: 'GET',
    headers,
    signal: original.signal
  })
  const response = await boundedRender({ event, render, original, isDirect })
  if (original.method !== 'HEAD') return response
  await response.body?.cancel()
  return new Response(null, {
    status: response.status,
    headers: response.headers
  })
}
