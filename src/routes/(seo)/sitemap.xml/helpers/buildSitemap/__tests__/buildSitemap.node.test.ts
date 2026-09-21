import { buildSitemap } from '../index.ts'

const SITE_URL = 'https://example.com'

describe('geração do sitemap', () => {
  it('publica uma URL absoluta por entrada', () => {
    const sitemap = buildSitemap({
      siteUrl: SITE_URL,
      entries: [{ path: '/' }, { path: '/docs' }, { path: '/docs/guia' }]
    })

    expect(sitemap).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url><loc>https://example.com/</loc></url>',
        '  <url><loc>https://example.com/docs</loc></url>',
        '  <url><loc>https://example.com/docs/guia</loc></url>',
        '</urlset>',
        ''
      ].join('\n')
    )
  })

  it('publica lastmod só nas entradas que declaram a data', () => {
    const sitemap = buildSitemap({
      siteUrl: SITE_URL,
      entries: [{ path: '/artigo', lastmod: '2026-09-21' }, { path: '/' }]
    })

    expect(sitemap).toContain(
      '  <url><loc>https://example.com/artigo</loc><lastmod>2026-09-21</lastmod></url>\n'
    )
    expect(sitemap).toContain('  <url><loc>https://example.com/</loc></url>\n')
  })

  it('publica um urlset vazio quando não há páginas estáticas', () => {
    const sitemap = buildSitemap({ siteUrl: SITE_URL, entries: [] })

    expect(sitemap).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '</urlset>',
        ''
      ].join('\n')
    )
  })

  it('escapa caracteres reservados do XML na URL e na data', () => {
    const sitemap = buildSitemap({
      siteUrl: SITE_URL,
      entries: [{ path: "/a&b'c", lastmod: '<2026>' }]
    })

    expect(sitemap).toContain('<loc>https://example.com/a&amp;b&apos;c</loc>')
    expect(sitemap).toContain('<lastmod>&lt;2026&gt;</lastmod>')
  })

  it('deixa a URL codificar o que o parser já percent-encoda', () => {
    const sitemap = buildSitemap({
      siteUrl: SITE_URL,
      entries: [{ path: '/a<b>"c d' }]
    })

    expect(sitemap).toContain('<loc>https://example.com/a%3Cb%3E%22c%20d</loc>')
  })

  it('escapa <, > e " que sobrevivem em URLs de caminho opaco', () => {
    const sitemap = buildSitemap({
      siteUrl: SITE_URL,
      entries: [{ path: 'data:text/plain,<x>"' }]
    })

    expect(sitemap).toContain('<loc>data:text/plain,&lt;x&gt;&quot;</loc>')
  })

  it('resolve caminhos absolutos contra a origem, ignorando o caminho do site', () => {
    const sitemap = buildSitemap({
      siteUrl: 'https://example.com/base/index.html?x=1',
      entries: [{ path: '/docs' }]
    })

    expect(sitemap).toContain('<loc>https://example.com/docs</loc>')
  })
})
