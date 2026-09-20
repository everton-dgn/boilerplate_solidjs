type BuildSitemapOptions = {
  paths: readonly string[]
  siteUrl: string
}

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
}

function escapeXml(value: string): string {
  return value.replaceAll(/[&<>"']/gu, char => XML_ESCAPES[char] ?? char)
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
