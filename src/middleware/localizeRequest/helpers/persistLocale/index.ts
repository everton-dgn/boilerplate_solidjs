import { parseCookieHeader, serializeCookie } from '@solidjs/web'

import {
  cookieDomain,
  cookieMaxAge,
  cookieName,
  type Locale
} from '@/paraglide/runtime.js'

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
  const vary = response.headers.get('vary')
  const fields = vary?.split(',').map(field => field.trim().toLowerCase()) ?? []
  if (!fields.includes('*') && !fields.includes('cookie')) {
    response.headers.set('vary', vary ? `${vary}, Cookie` : 'Cookie')
  }
  if (parseCookieHeader(request.headers.get('cookie'))[cookieName] === locale) {
    return response
  }
  response.headers.append(
    'set-cookie',
    serializeCookie(cookieName, locale, {
      path: '/',
      maxAge: cookieMaxAge,
      domain: cookieDomain || undefined,
      sameSite: 'lax',
      secure: new URL(request.url).protocol === 'https:'
    })
  )
  response.headers.set('cache-control', 'private, no-store')
  return response
}
