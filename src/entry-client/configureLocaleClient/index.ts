import { serializeCookie } from '@solidjs/web'

import {
  assertIsLocale,
  cookieDomain,
  cookieMaxAge,
  cookieName,
  localizeUrl,
  overwriteSetLocale
} from '@/paraglide/runtime.js'

import { installLocaleHistoryGuard } from './installLocaleHistoryGuard/index.ts'

export function configureLocaleClient(): () => void {
  // oxlint-disable-next-line eslint/max-params -- A assinatura do callback é definida pelo Paraglide.
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
  // This runs before hydrate mounts the Router. The listener lives with the
  // document; the returned disposer supports teardown in tests and HMR.
  return installLocaleHistoryGuard()
}
