import { parseCookieHeader, serializeCookie } from '@solidjs/web'

import type { Theme } from '@/@types/theme.ts'
import { THEME_COOKIE_MAX_AGE, THEME_COOKIE_NAME } from '@/constants/theme.ts'
import { isTheme } from '@/helpers/isTheme/index.ts'

export function readTheme(
  cookieHeader?: string | null
): Theme | null | undefined {
  try {
    const cookies = cookieHeader === undefined ? document.cookie : cookieHeader
    const value = parseCookieHeader(cookies)[THEME_COOKIE_NAME]
    return isTheme(value) ? value : null
  } catch {
    return undefined
  }
}

export function saveTheme(theme: Theme): boolean {
  try {
    // oxlint-disable-next-line unicorn/no-document-cookie -- O Solid serializa o cookie; a releitura síncrona detecta escritas bloqueadas.
    document.cookie = serializeCookie(THEME_COOKIE_NAME, theme, {
      path: '/',
      maxAge: THEME_COOKIE_MAX_AGE,
      sameSite: 'lax',
      secure: location.protocol === 'https:'
    })
    return parseCookieHeader(document.cookie)[THEME_COOKIE_NAME] === theme
  } catch {
    return false
  }
}
