import {
  assertIsLocale,
  localizeUrl,
  overwriteSetLocale
} from '@paraglide/runtime.js'

import { serializeLocaleCookie } from '@/i18n/serializeLocaleCookie/index.ts'

import { installLocaleHistoryGuard } from './installLocaleHistoryGuard/index.ts'

export function configureLocaleClient(): () => void {
  overwriteSetLocale((newLocale, options) => {
    const locale = assertIsLocale(newLocale)
    try {
      // oxlint-disable-next-line unicorn/no-document-cookie -- A persistência é opcional; o idioma da URL funciona mesmo com cookies bloqueados.
      document.cookie = serializeLocaleCookie({
        locale,
        protocol: location.protocol
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
