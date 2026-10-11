import {
  getRequestEvent,
  HREF,
  isServer,
  redirect,
  type ResponseHelperInit
} from '@solidjs/web'

import { resolveLocalizedHref } from '@/i18n/urls/index.ts'
import type { Locale } from '@/paraglide/runtime.js'

type LocalizedRedirectOptions = ResponseHelperInit & {
  href: Parameters<typeof redirect>[0]
  locale?: Locale
  localize?: boolean
}

/** Retorna a Response do Solid sem alterações; quem chama pode retorná-la ou lançá-la como de costume.
 * O idioma padrão vem do contexto da requisição do Paraglide (incluindo Accept-Language).
 */
export function localizedRedirect({
  href,
  locale,
  localize,
  ...init
}: LocalizedRedirectOptions): Response {
  const logicalHref = typeof href === 'string' ? href : href[HREF]
  let target = typeof logicalHref === 'string' ? logicalHref : String(href)
  if (localize !== false && !/^(?:\/|[a-z][a-z\d+.-]*:)/iu.test(target)) {
    const base = isServer
      ? getRequestEvent()?.locals.localizedPageBase
      : globalThis.location.href
    if (!base) {
      throw new Error(
        'localizedRedirect requires a safe page base for relative hrefs. Use a root-relative href or localize: false for endpoints/assets.'
      )
    }
    const url = new URL(target, base)
    target = `${url.pathname}${url.search}${url.hash}`
  }
  return redirect(
    resolveLocalizedHref({
      href: target,
      locale,
      localize
    }),
    init
  )
}
