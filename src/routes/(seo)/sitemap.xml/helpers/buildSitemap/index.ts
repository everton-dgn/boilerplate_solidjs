import type { SitemapEntry } from '@/@types/sitemap.ts'
import { localizeHref } from '@/i18n/urls/index.ts'
import { baseLocale, locales } from '@/paraglide/runtime.js'

type BuildSitemapOptions = {
  entries: readonly SitemapEntry[]
  siteUrl: string
}

// Caminhos hierárquicos saem de URL.href percent-encodados, mas caminhos
// opacos (data:, mailto:) preservam <, > e ", então o XML escapa os cinco.
function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function buildSitemap({
  entries,
  siteUrl
}: BuildSitemapOptions): string {
  const urls = entries.flatMap(({ path, lastmod }) => {
    const alternatives = [...locales, 'x-default' as const]
      .map(hreflang => {
        const locale = hreflang === 'x-default' ? baseLocale : hreflang
        const href = escapeXml(
          new URL(localizeHref({ href: path, locale }), siteUrl).href
        )
        return `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${href}"/>`
      })
      .join('')
    const modified =
      lastmod === undefined ? '' : `<lastmod>${escapeXml(lastmod)}</lastmod>`
    return locales.map(locale => {
      const href = localizeHref({ href: path, locale })
      const loc = `<loc>${escapeXml(new URL(href, siteUrl).href)}</loc>`
      return `  <url>${loc}${modified}${alternatives}</url>`
    })
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    ''
  ].join('\n')
}
