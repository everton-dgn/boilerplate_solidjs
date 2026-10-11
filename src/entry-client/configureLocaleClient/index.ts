import {
  assertIsLocale,
  cookieDomain,
  cookieMaxAge,
  cookieName,
  localizeUrl,
  overwriteSetLocale
} from '@paraglide/runtime.js'
import { serializeCookie } from '@solidjs/web'

import { installLocaleHistoryGuard } from './installLocaleHistoryGuard/index.ts'

export function configureLocaleClient(): () => void {
  overwriteSetLocale((newLocale, options) => {
    const locale = assertIsLocale(newLocale)
    try {
      // oxlint-disable-next-line unicorn/no-document-cookie -- A persistência é opcional; o idioma da URL funciona mesmo com cookies bloqueados.
      document.cookie = serializeCookie(cookieName, locale, {
        path: '/',
        maxAge: cookieMaxAge,
        domain: cookieDomain || undefined,
        sameSite: 'lax',
        secure: location.protocol === 'https:'
      })
    } catch {
      // O navegador pode bloquear cookies. Preserva hidratação e navegação.
    }
    if (options?.reload === false) return
    const target = localizeUrl(location.href, { locale })
    if (target.href !== location.href) location.assign(target.href)
  })
  return installLocaleHistoryGuard()
}
