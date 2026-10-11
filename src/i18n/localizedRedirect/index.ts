import type { Locale } from '@paraglide/runtime.js'
import {
  getRequestEvent,
  HREF,
  isServer,
  redirect,
  type ResponseHelperInit
} from '@solidjs/web'

import { resolveLocalizedHref } from '@/i18n/urls/index.ts'

type LocalizedRedirectOptions = ResponseHelperInit & {
  href: Parameters<typeof redirect>[0]
  locale?: Locale
  shouldLocalize?: boolean
}

export function localizedRedirect({
  href,
  locale,
  shouldLocalize,
  ...init
}: LocalizedRedirectOptions): Response {
  const logicalHref = typeof href === 'string' ? href : href[HREF]
  let target = typeof logicalHref === 'string' ? logicalHref : String(href)
  if (shouldLocalize !== false && !/^(?:\/|[a-z][a-z\d+.-]*:)/iu.test(target)) {
    const base = isServer
      ? getRequestEvent()?.locals.localizedPageBase
      : globalThis.location.href
    if (!base) {
      throw new Error(
        'localizedRedirect requires a safe page base for relative hrefs. Use a root-relative href or shouldLocalize: false for endpoints/assets.'
      )
    }
    const url = new URL(target, base)
    target = `${url.pathname}${url.search}${url.hash}`
  }
  return redirect(
    resolveLocalizedHref({
      href: target,
      locale,
      shouldLocalize
    }),
    init
  )
}
