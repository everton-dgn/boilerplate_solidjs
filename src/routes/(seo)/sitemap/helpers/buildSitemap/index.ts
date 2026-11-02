import type { SitemapEntry } from '@/@types/sitemap.ts'
import { buildLocaleAlternates } from '@/i18n/buildLocaleAlternates/index.ts'

type BuildSitemapOptions = {
  entries: readonly SitemapEntry[]
  siteUrl: string
  byteBudget?: number
}
const START =
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
const END = '</urlset>\n'
const encoder = new TextEncoder()

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

export class SitemapByteLimitError extends Error {
  public constructor() {
    super('Sitemap excede limite de bytes')
    this.name = 'SitemapByteLimitError'
  }
}

export function buildSitemap({
  entries,
  siteUrl,
  byteBudget
}: BuildSitemapOptions): string {
  const chunks = [START]
  let bytes = encoder.encode(START).byteLength + encoder.encode(END).byteLength
  if (byteBudget !== undefined && bytes > byteBudget) {
    throw new SitemapByteLimitError()
  }
  for (const { path, lastmod } of entries) {
    const alternates = buildLocaleAlternates({ href: path, siteUrl })
    const links = alternates
      .map(
        ({ hreflang, href }) =>
          `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${escapeXml(href)}"/>`
      )
      .join('')
    const modified =
      lastmod === undefined ? '' : `<lastmod>${escapeXml(lastmod)}</lastmod>`
    const group = `${alternates
      .filter(({ hreflang }) => hreflang !== 'x-default')
      .map(
        ({ href }) =>
          `  <url><loc>${escapeXml(href)}</loc>${modified}${links}</url>`
      )
      .join('\n')}\n`
    bytes += encoder.encode(group).byteLength
    if (byteBudget !== undefined && bytes > byteBudget) {
      throw new SitemapByteLimitError()
    }
    chunks.push(group)
  }
  chunks.push(END)
  return chunks.join('')
}
