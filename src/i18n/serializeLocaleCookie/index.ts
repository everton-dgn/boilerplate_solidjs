import {
  cookieDomain,
  cookieMaxAge,
  cookieName,
  type Locale
} from '@paraglide/runtime.js'
import { serializeCookie } from '@solidjs/web'

type LocaleCookieOptions = { locale: Locale; protocol: string }

export function serializeLocaleCookie({
  locale,
  protocol
}: LocaleCookieOptions): string {
  return serializeCookie(cookieName, locale, {
    path: '/',
    maxAge: cookieMaxAge,
    domain: cookieDomain || undefined,
    sameSite: 'lax',
    secure: protocol === 'https:'
  })
}
