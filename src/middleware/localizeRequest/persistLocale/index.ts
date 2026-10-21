import {
  cookieDomain,
  cookieMaxAge,
  cookieName,
  cookieSameSite,
  cookieSecure,
  type Locale
} from '@paraglide/runtime.js'
import { parseCookieHeader, serializeCookie } from '@solidjs/web'

import { appendVary } from '../../helpers/appendVary/index.ts'

type PersistLocaleOptions = {
  request: Request
  response: Response
  locale: Locale
}

export function persistLocale({
  request,
  response,
  locale
}: PersistLocaleOptions): Response {
  appendVary({ response, field: 'Cookie' })
  if (parseCookieHeader(request.headers.get('cookie'))[cookieName] === locale) {
    return response
  }
  response.headers.append(
    'set-cookie',
    serializeCookie(cookieName, locale, {
      path: '/',
      maxAge: cookieMaxAge,
      domain: cookieDomain || undefined,
      sameSite: cookieSameSite,
      secure:
        cookieSecure === true ||
        (cookieSecure === 'auto' && new URL(request.url).protocol === 'https:')
    })
  )
  response.headers.set('cache-control', 'private, no-store')
  return response
}
