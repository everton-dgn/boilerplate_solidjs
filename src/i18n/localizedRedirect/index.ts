import type { Locale } from '@paraglide/runtime.js'
import {
  getRequestEvent,
  HREF,
  isServer,
  redirect,
  type ResponseHelperInit
} from '@solidjs/web'

import { isAbsoluteHref, resolveLocalizedHref } from '@/i18n/urls/index.ts'

type LocalizedRedirectOptions = ResponseHelperInit & {
  href: Parameters<typeof redirect>[0]
  locale?: Locale
  shouldLocalize?: boolean
}

function readPageBase(): string | undefined {
  return isServer
    ? getRequestEvent()?.locals.localizedPageBase
    : globalThis.location.href
}

export function localizedRedirect({
  href,
  locale,
  shouldLocalize,
  ...init
}: LocalizedRedirectOptions): Response {
  const logicalHref = typeof href === 'string' ? href : href[HREF]
  const target = typeof logicalHref === 'string' ? logicalHref : String(href)
  // A base só é lida para destinos relativos: getRequestEvent() avisa quando
  // é chamado fora de uma requisição.
  const isRelativePage =
    shouldLocalize !== false &&
    !target.startsWith('/') &&
    !isAbsoluteHref(target)
  return redirect(
    resolveLocalizedHref({
      href: target,
      locale,
      shouldLocalize,
      base: isRelativePage ? readPageBase() : undefined
    }),
    init
  )
}
