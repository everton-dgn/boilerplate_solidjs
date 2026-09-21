import type { SitemapEntry } from '@/@types/sitemap.ts'

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
  const urls = entries.map(({ path, lastmod }) => {
    const loc = `<loc>${escapeXml(new URL(path, siteUrl).href)}</loc>`
    const modified =
      lastmod === undefined ? '' : `<lastmod>${escapeXml(lastmod)}</lastmod>`
    return `  <url>${loc}${modified}</url>`
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    ''
  ].join('\n')
}
