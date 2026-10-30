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

/** Requer um Router. A navegação de documento não transporta estado do roteador nem opções de rolagem. */
export function createLocalizedNavigate() {
  const navigate = useNavigate()
  const location = useLocation()

  return ({
    href,
    locale,
    shouldLocalize,
    ...options
  }: LocalizedNavigateOptions): void => {
    const target = resolveLocalizedHref({
      href: String(href),
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
