import { buildSitemap } from '../index.ts'

const SITE_URL = 'https://example.com'

describe('sitemap generation', () => {
  it('publishes one absolute URL per entry', () => {
    const sitemap = buildSitemap({
      siteUrl: SITE_URL,
      entries: [{ path: '/' }, { path: '/docs' }, { path: '/docs/guia' }]
    })

    const locations = [...sitemap.matchAll(/<loc>(?<url>[^<]+)<\/loc>/gu)].map(
      match => match.groups?.url
    )
    expect(locations).toStrictEqual([
      'https://example.com/pt',
      'https://example.com/en',
      'https://example.com/es',
      'https://example.com/pt/docs',
      'https://example.com/en/docs',
      'https://example.com/es/docs',
      'https://example.com/pt/docs/guia',
      'https://example.com/en/docs/guia',
      'https://example.com/es/docs/guia'
    ])
    expect(sitemap).toContain(
      'hreflang="x-default" href="https://example.com/en"'
    )
  })

  it('publishes lastmod only on the entries that declare the date', () => {
    const sitemap = buildSitemap({
      siteUrl: SITE_URL,
      entries: [{ path: '/article', lastmod: '2026-09-21' }, { path: '/' }]
    })

    expect(sitemap).toContain(
      '  <url><loc>https://example.com/pt/article</loc><lastmod>2026-09-21</lastmod>'
    )
    expect(sitemap).toContain(
      '  <url><loc>https://example.com/pt</loc><xhtml:link'
    )
  })

  it('publishes an empty urlset when there are no static pages', () => {
    const sitemap = buildSitemap({ siteUrl: SITE_URL, entries: [] })

    expect(sitemap).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        '</urlset>',
        ''
      ].join('\n')
    )
  })

  it('escapes XML reserved characters in the URL and the date', () => {
    const sitemap = buildSitemap({
      siteUrl: SITE_URL,
      entries: [{ path: "/a&b'c", lastmod: '<2026>' }]
    })

    expect(sitemap).toContain(
      '<loc>https://example.com/pt/a&amp;b&apos;c</loc>'
    )
    expect(sitemap).toContain('<lastmod>&lt;2026&gt;</lastmod>')
  })

  it('lets the URL encode what the parser already percent-encodes', () => {
    const sitemap = buildSitemap({
      siteUrl: SITE_URL,
      entries: [{ path: '/a<b>"c d' }]
    })

    expect(sitemap).toContain(
      '<loc>https://example.com/pt/a%3Cb%3E%22c%20d</loc>'
    )
  })

  it('escapes <, > and " that survive in opaque path URLs', () => {
    const sitemap = buildSitemap({
      siteUrl: SITE_URL,
      entries: [{ path: 'data:text/plain,<x>"' }]
    })

    expect(sitemap).toContain('<loc>data:text/plain,&lt;x&gt;&quot;</loc>')
  })

  it('resolves absolute paths against the origin, ignoring the site path', () => {
    const sitemap = buildSitemap({
      siteUrl: 'https://example.com/base/index.html?x=1',
      entries: [{ path: '/docs' }]
    })

    expect(sitemap).toContain('<loc>https://example.com/pt/docs</loc>')
  })
})
