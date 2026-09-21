type BuildSitemapOptions = {
  paths: readonly string[]
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

export function buildSitemap({ paths, siteUrl }: BuildSitemapOptions): string {
  const urls = paths.map(
    path => `  <url><loc>${escapeXml(new URL(path, siteUrl).href)}</loc></url>`
  )
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    ''
  ].join('\n')
}
