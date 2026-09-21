import { buildSitemap } from '../index.ts'

const SITE_URL = 'https://example.com'

describe('geração do sitemap', () => {
  it('publica uma URL absoluta por caminho', () => {
    const sitemap = buildSitemap({
      siteUrl: SITE_URL,
      paths: ['/', '/docs', '/docs/guia']
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

  it('publica um urlset vazio quando não há páginas estáticas', () => {
    const sitemap = buildSitemap({ siteUrl: SITE_URL, paths: [] })

    expect(sitemap).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '</urlset>',
        ''
      ].join('\n')
    )
  })

  it('escapa caracteres reservados do XML na URL', () => {
    const sitemap = buildSitemap({ siteUrl: SITE_URL, paths: ["/a&b'c"] })

    expect(sitemap).toContain('<loc>https://example.com/a&amp;b&apos;c</loc>')
  })

  it('deixa a URL codificar o que o parser já percent-encoda', () => {
    const sitemap = buildSitemap({ siteUrl: SITE_URL, paths: ['/a<b>"c d'] })

    expect(sitemap).toContain('<loc>https://example.com/a%3Cb%3E%22c%20d</loc>')
  })

  it('resolve caminhos absolutos contra a origem, ignorando o caminho do site', () => {
    const sitemap = buildSitemap({
      siteUrl: 'https://example.com/base/index.html?x=1',
      paths: ['/docs']
    })

    expect(sitemap).toContain('<loc>https://example.com/docs</loc>')
  })
})
