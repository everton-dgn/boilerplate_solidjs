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

/** Returns Solid's Response unchanged; callers may return or throw it as usual.
 * The default locale comes from Paraglide's request scope (including Accept-Language).
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
