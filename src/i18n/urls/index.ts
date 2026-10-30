import {
  deLocalizeUrl,
  getLocale,
  type Locale,
  localizeHref as localizeParaglideHref
} from '@paraglide/runtime.js'

type LocalizeHrefOptions = { href: string; locale?: Locale }

type ResolveLocalizedHrefOptions = LocalizeHrefOptions & {
  base?: string
  shouldLocalize?: boolean
}

const LOCAL_ORIGIN = 'https://local.invalid'

export function isAbsoluteHref(href: string): boolean {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(href)) return true
  // O parser de URL descarta TAB e lê '\' como '/': '/\host' e '/<TAB>/host'
  // apontam para outro host.
  return (
    href.startsWith('/') && new URL(href, LOCAL_ORIGIN).origin !== LOCAL_ORIGIN
  )
}

export function localizeHref({ href, locale }: LocalizeHrefOptions): string {
  if (!href.startsWith('/') || isAbsoluteHref(href)) return href
  return localizeParaglideHref(href, { locale })
}

export function delocalizePathname(pathname: string): string {
  return deLocalizeUrl(new URL(pathname, LOCAL_ORIGIN)).pathname
}

export function resolveLocalizedHref({
  href,
  locale,
  base,
  shouldLocalize = true
}: ResolveLocalizedHrefOptions): string {
  if (!shouldLocalize || isAbsoluteHref(href)) return href
  const currentLocale = getLocale()
  if (
    (href === '' || href.startsWith('#')) &&
    (!locale || locale === currentLocale)
  ) {
    return href
  }
  let resolved = href
  if (!href.startsWith('/')) {
    if (!base) {
      throw new Error(
        'Localized navigation requires a Router or base for relative page URLs. Use a root-relative href or shouldLocalize: false for endpoints/assets.'
      )
    }
    const url = new URL(href, new URL(base, LOCAL_ORIGIN))
    resolved = `${url.pathname}${url.search}${url.hash}`
  }
  return localizeHref({ href: resolved, locale: locale ?? currentLocale })
}
