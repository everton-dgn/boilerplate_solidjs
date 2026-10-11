import {
  useLocation,
  useNavigate,
  type NavigateOptions,
  type TypedPath
} from '@solidjs/router'
import { isServer } from '@solidjs/web'

import { resolveLocalizedHref } from '@/i18n/urls/index.ts'
import { getLocale, type Locale } from '@/paraglide/runtime.js'

type LocalizedNavigateOptions = Omit<Partial<NavigateOptions>, 'resolve'> & {
  href: string | TypedPath
  locale?: Locale
  localize?: boolean
}

/** Requer um Router. A navegação de documento não transporta estado do roteador nem opções de rolagem. */
export function createLocalizedNavigate() {
  const navigate = useNavigate()
  const location = useLocation()

  return ({
    href,
    locale,
    localize,
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
      href: localize === false ? requestedHref : resolvedHref,
      locale,
      localize,
      base: `${location.pathname}${location.search}${location.hash}`
    })
    const documentNavigation =
      localize === false ||
      (locale !== undefined && locale !== getLocale()) ||
      /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(target)
    if (documentNavigation && !isServer) {
      if (options.replace) globalThis.location.replace(target)
      else globalThis.location.assign(target)
      return
    }
    navigate(target, { ...options, resolve: false })
  }
}
