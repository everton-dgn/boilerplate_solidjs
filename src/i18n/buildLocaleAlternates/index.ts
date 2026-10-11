import { baseLocale, type Locale, locales } from '@paraglide/runtime.js'

import { localizeHref } from '@/i18n/urls/index.ts'

type BuildLocaleAlternatesOptions = { href: string; siteUrl: string }

type LocaleAlternate = { hreflang: Locale | 'x-default'; href: string }

export function buildLocaleAlternates({
  href,
  siteUrl
}: BuildLocaleAlternatesOptions): LocaleAlternate[] {
  return [...locales, 'x-default' as const].map(hreflang => {
    const locale = hreflang === 'x-default' ? baseLocale : hreflang
    return {
      hreflang,
      href: new URL(localizeHref({ href, locale }), siteUrl).href
    }
  })
}
