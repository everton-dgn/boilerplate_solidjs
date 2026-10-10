import { getRequestEvent } from '@solidjs/web'
import { createAPIMatcher } from 'filesystem-routing/api'
import routes from 'virtual:file-routes'
import { endpoint } from 'virtual:solid-server-function-handler'

import { shouldRedirect } from '@/paraglide/runtime.js'
import { paraglideMiddleware } from '@/paraglide/server.js'

import { applySecurityHeaders, requestNonce } from '../securityHeaders/index.ts'
import type { Next } from '../types.ts'
import { normalizeLanguageRequest } from './helpers/normalizeLanguageRequest/index.ts'
import { persistLocale } from './helpers/persistLocale/index.ts'

type LocalizeRequestOptions = { request: Request; next: Next }
type LocaleRequest = { request: Request; pageBase?: string }

const HTTP_TEMPORARY_REDIRECT = 307
const matchAPI = createAPIMatcher(routes)

function isServerFunctionPath(pathname: string): boolean {
  return pathname === endpoint || pathname.startsWith(`${endpoint}/`)
}

function isPage(request: Request): boolean {
  const { pathname } = new URL(request.url)
  const accept = request.headers.get('accept')
  return (
    (request.method === 'GET' || request.method === 'HEAD') &&
    (!accept || accept.includes('text/html') || accept.includes('*/*')) &&
    matchAPI(pathname, request.method)?.isPage !== false
  )
}

function serverFunctionLocale(request: Request): LocaleRequest {
  let url = new URL(request.url)
  let pageBase: string | undefined
  const referer = request.headers.get('referer')
  if (referer) {
    try {
      const source = new URL(referer)
      if (
        source.origin === url.origin &&
        !source.username &&
        !source.password
      ) {
        url = source
        if (
          !isServerFunctionPath(source.pathname) &&
          matchAPI(source.pathname, 'GET')?.isPage !== false
        ) {
          pageBase = source.href
        }
      }
    } catch {
      // Referer inválido usa cookie, Accept-Language e idioma base.
    }
  }
  const headers = new Headers(request.headers)
  headers.delete('sec-fetch-dest')
  // Somente a detecção usa esta requisição sem corpo. A ação recebe o POST
  // original, sem clonagem ou leitura antecipada do seu stream.
  return { request: new Request(url, { headers }), pageBase }
}

export async function localizeRequest({
  request,
  next
}: LocalizeRequestOptions): Promise<Response> {
  const { pathname } = new URL(request.url)
  const isServerFunction = isServerFunctionPath(pathname)
  const event = getRequestEvent()
  if (event) event.locals.localizedPageBase = undefined
  if (!isServerFunction && !isPage(request)) return next()
  const localized = isServerFunction
    ? serverFunctionLocale(request)
    : { request, pageBase: request.url }
  if (event) event.locals.localizedPageBase = localized.pageBase
  const localeRequest = normalizeLanguageRequest(localized.request)
  const decision = await shouldRedirect({ request: localeRequest })
  // Também atende HEAD, crawlers e clientes HTTP sem Sec-Fetch-Dest. A
  // decisão usa URL > cookie > Accept-Language > idioma base.
  if (!isServerFunction && decision.shouldRedirect && decision.redirectUrl) {
    return persistLocale({
      request,
      locale: decision.locale,
      response: applySecurityHeaders({
        response: new Response(null, {
          status: HTTP_TEMPORARY_REDIRECT,
          headers: {
            location: decision.redirectUrl.href,
            'cache-control': 'private, no-store',
            vary: 'Cookie, Accept-Language'
          }
        }),
        nonce: requestNonce()
      })
    })
  }
  // O router transforma só o caminho usado para matching. Preservar a
  // requisição original mantém URLs, canonical e hidratação coerentes.
  return paraglideMiddleware(localeRequest, async ({ locale }) => {
    const response = await next()
    response.headers.set('content-language', locale)
    // Uma chamada em segundo plano não deve sobrescrever a escolha da página.
    return isServerFunction
      ? response
      : persistLocale({ request, response, locale })
  })
}
