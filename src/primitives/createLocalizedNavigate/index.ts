import { getLocale, type Locale } from '@paraglide/runtime.js'
import {
  useLocation,
  useNavigate,
  type NavigateOptions,
  type TypedPath
} from '@solidjs/router'
import { isServer } from '@solidjs/web'

import { isAbsoluteHref, resolveLocalizedHref } from '@/i18n/urls/index.ts'

type LocalizedNavigateOptions = Omit<Partial<NavigateOptions>, 'resolve'> & {
  href: string | TypedPath
  locale?: Locale
  shouldLocalize?: boolean
}

/** Requires a Router. Document navigation carries neither router state nor scroll options. */
export function createLocalizedNavigate() {
  const navigate = useNavigate()
  const location = useLocation()

  return ({
    href,
    locale,
    shouldLocalize,
    ...options
  }: LocalizedNavigateOptions): void => {
    const requestedHref = String(href)
    // Anchor fragments can stay relative; navigation with resolve: false needs
    // the full path of the current page, query parameters included.
    const resolvedHref =
      requestedHref === '' || requestedHref.startsWith('#')
        ? `${location.pathname}${location.search}${requestedHref}`
        : requestedHref
    const target = resolveLocalizedHref({
      href: shouldLocalize === false ? requestedHref : resolvedHref,
      locale,
      shouldLocalize,
      base: `${location.pathname}${location.search}${location.hash}`
    })
    const shouldUseDocumentNavigation =
      shouldLocalize === false ||
      (locale !== undefined && locale !== getLocale()) ||
      isAbsoluteHref(target)
    if (shouldUseDocumentNavigation && !isServer) {
      if (options.replace) globalThis.location.replace(target)
      else globalThis.location.assign(target)
      return
    }
    navigate(target, { ...options, resolve: false })
  }
}
