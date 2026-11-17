import { shouldRedirect } from '@paraglide/runtime.js'
import { paraglideMiddleware } from '@paraglide/server.js'
import { getRequestEvent } from '@solidjs/web'

import { HTTP_TEMPORARY_REDIRECT } from '@/constants/http.ts'

import {
  isPagePath,
  isServerFunctionPath
} from '../requestClassification/index.ts'
import { applySecurityHeaders } from '../securityHeaders/index.ts'
import type { Next } from '../types.ts'
import { persistLocale } from './persistLocale/index.ts'

type LocalizeRequestOptions = { request: Request; next: Next }
type LocaleRequest = { request: Request; pageBase?: string }

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
        if (isPagePath({ pathname: source.pathname, method: 'GET' })) {
          pageBase = source.href
        }
      }
    } catch {
      // An invalid Referer uses the cookie, Accept-Language and the base locale.
    }
  }
  const headers = new Headers(request.headers)
  headers.delete('sec-fetch-dest')
  // Only the detection uses this request without a body. The action receives the
  // original POST, without cloning or reading its stream early.
  return { request: new Request(url, { headers }), pageBase }
}

export async function localizeRequest({
  request,
  next
}: LocalizeRequestOptions): Promise<Response> {
  const { pathname } = new URL(request.url)
  const isServerFunction = isServerFunctionPath(pathname)
  const isPage =
    (request.method === 'GET' || request.method === 'HEAD') &&
    isPagePath({ pathname, method: request.method })
  const event = getRequestEvent()
  if (event) event.locals.localizedPageBase = undefined
  if (!isServerFunction && !isPage) return next()
  const localized = isServerFunction
    ? serverFunctionLocale(request)
    : { request, pageBase: request.url }
  if (event) event.locals.localizedPageBase = localized.pageBase
  const localeRequest = localized.request
  // Also serves HEAD, crawlers and HTTP clients without Sec-Fetch-Dest. The
  // decision uses URL > cookie > Accept-Language > base locale.
  const decision = isServerFunction
    ? undefined
    : await shouldRedirect({ request: localeRequest })
  if (decision?.shouldRedirect && decision.redirectUrl) {
    return persistLocale({
      request,
      locale: decision.locale,
      response: applySecurityHeaders(
        new Response(null, {
          status: HTTP_TEMPORARY_REDIRECT,
          headers: {
            location: decision.redirectUrl.href,
            'cache-control': 'private, no-store',
            vary: 'Cookie, Accept-Language'
          }
        })
      )
    })
  }
  // The router changes only the path used for matching. Keeping the original
  // request keeps URLs, canonical and hydration consistent.
  return paraglideMiddleware(localeRequest, async ({ locale }) => {
    const response = await next()
    response.headers.set('content-language', locale)
    // A background call must not overwrite the choice of the page.
    return isServerFunction
      ? response
      : persistLocale({ request, response, locale })
  })
}
