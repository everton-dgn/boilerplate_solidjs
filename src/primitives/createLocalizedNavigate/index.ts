import { getLocale, type Locale } from '@paraglide/runtime.js'
import {
  useLocation,
  useNavigate,
  type NavigateOptions,
  type TypedPath
} from '@solidjs/router'
import { isServer } from '@solidjs/web'

import { resolveLocalizedHref } from '@/i18n/urls/index.ts'

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
    const requestedHref = String(href)
    // Fragmentos de âncora podem permanecer relativos; a navegação com resolve: false
    // precisa do caminho completo da página atual, incluindo os parâmetros de consulta.
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
      /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(target)
    if (shouldUseDocumentNavigation && !isServer) {
      if (options.replace) globalThis.location.replace(target)
      else globalThis.location.assign(target)
      return
    }
    navigate(target, { ...options, resolve: false })
  }
}
