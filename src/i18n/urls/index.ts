import {
  deLocalizeUrl,
  getLocale,
  type Locale,
  localizeUrl
} from '@paraglide/runtime.js'

type LocalizeHrefOptions = { href: string; locale?: Locale }

type ResolveLocalizedHrefOptions = LocalizeHrefOptions & {
  base?: string
  shouldLocalize?: boolean
}

const LOCAL_ORIGIN = 'https://local.invalid'

export function localizeHref({
  href,
  locale = getLocale()
}: LocalizeHrefOptions): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href
  const url = localizeUrl(new URL(href, LOCAL_ORIGIN), { locale })
  return `${url.pathname}${url.search}${url.hash}`
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
  if (!shouldLocalize || /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(href)) return href
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
