import { cookieName, type Locale } from '@paraglide/runtime.js'
import { parseCookieHeader } from '@solidjs/web'

import { serializeLocaleCookie } from '@/i18n/serializeLocaleCookie/index.ts'

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
    serializeLocaleCookie({ locale, protocol: new URL(request.url).protocol })
  )
  response.headers.set('cache-control', 'private, no-store')
  return response
}
