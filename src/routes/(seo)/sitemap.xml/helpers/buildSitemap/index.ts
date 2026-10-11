import type { SitemapEntry } from '@/@types/sitemap.ts'
import { buildLocaleAlternates } from '@/i18n/buildLocaleAlternates/index.ts'

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
    const alternates = buildLocaleAlternates({ href: path, siteUrl })
    const links = alternates
      .map(
        ({ hreflang, href }) =>
          `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${escapeXml(href)}"/>`
      )
      .join('')
    const modified =
      lastmod === undefined ? '' : `<lastmod>${escapeXml(lastmod)}</lastmod>`
    return alternates
      .filter(({ hreflang }) => hreflang !== 'x-default')
      .map(
        ({ href }) =>
          `  <url><loc>${escapeXml(href)}</loc>${modified}${links}</url>`
      )
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    ''
  ].join('\n')
}
