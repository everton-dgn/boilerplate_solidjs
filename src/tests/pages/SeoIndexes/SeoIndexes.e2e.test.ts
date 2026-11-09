import { expect, test } from '@playwright/test'

import { readSiteOrigin } from '@/tests/helpers/readSiteOrigin/index.ts'

const HTTP_OK = 200
const HTTP_NOT_FOUND = 404
// Entradas publicadas pela fonte de `blog/[slug]`.
const BLOG_ENTRIES = 2
const HOME_TITLE = 'SolidJS Boilerplate | Web applications with SSR'
const SITE_DESCRIPTION =
  'A foundation for web applications with SolidJS, TypeScript and Vite+, with server-side rendering and light and dark themes.'

test.describe('índices gerados do manifesto de rotas', () => {
  for (const method of ['GET', 'HEAD']) {
    test(`recusa ${method} de partição existente sem sufixo XML`, async ({
      request
    }) => {
      const canonical = await request.fetch('/sitemaps/catalog/a.xml', {
        method,
        maxRedirects: 0
      })
      expect(canonical.status()).toBe(HTTP_OK)
      const invalid = await request.fetch('/sitemaps/catalog/a', {
        method,
        maxRedirects: 0
      })
      expect(invalid.status()).toBe(HTTP_NOT_FOUND)
      expect(invalid.headers()['cache-control']).toBe('no-store')
      expect(await invalid.body()).toHaveLength(0)
    })
  }

  test('gera sitemap, robots e llms.txt a partir do manifesto de rotas', async ({
    request
  }) => {
    const siteUrl = readSiteOrigin()
    const cacheControl =
      'public, max-age=0, s-maxage=3600, stale-if-error=86400'

    const sitemap = await request.get('/sitemap.xml')
    expect(sitemap.status()).toBe(HTTP_OK)
    expect(sitemap.headers()['content-type']).toContain('application/xml')
    expect(sitemap.headers()['cache-control']).toBe(cacheControl)
    const index = await sitemap.text()
    expect(index).toContain('<sitemapindex')
    expect(index).toContain(`${siteUrl}/sitemaps/catalog/a.xml`)
    const parts = [...index.matchAll(/<loc>(?<url>[^<]+)<\/loc>/gu)]
    const bodies = await Promise.all(
      parts.map(async match => {
        const location = new URL(String(match.groups?.url))
        expect(location.origin).toBe(siteUrl)
        const response = await request.get(location.pathname)
        expect(response.status()).toBe(HTTP_OK)
        return response.text()
      })
    )
    const xml = bodies.join('\n')
    expect(xml).toContain(`<loc>${siteUrl}/pt/catalog/a-1</loc>`)
    const missingPart = await request.get('/sitemaps/catalog/removed.xml')
    expect(missingPart.status()).toBe(HTTP_NOT_FOUND)
    expect(missingPart.headers()['cache-control']).toBe('no-store')
    // Partes estáticas fora do manifesto seguem como 404, sem cache negativo.
    const missingPage = await request.get('/sitemaps/pages/9999.xml')
    expect(missingPage.status()).toBe(HTTP_NOT_FOUND)
    expect(missingPage.headers()['cache-control']).toBe('no-store')
    const inventory = await request.get('/sitemaps/static.json', {
      headers: { 'x-nitro-prerender': '/sitemaps/static.json' }
    })
    expect(inventory.status()).toBe(HTTP_NOT_FOUND)
    expect(xml).toContain(`<loc>${siteUrl}/pt</loc>`)
    expect(xml).toContain(`<loc>${siteUrl}/pt/backend-error</loc>`)
    expect(xml).toContain(`<loc>${siteUrl}/pt/seo-public</loc>`)
    expect(xml).toContain(`<loc>${siteUrl}/pt/seo-sitemap-only</loc>`)
    expect(xml).toContain(
      `<url><loc>${siteUrl}/pt/seo-article</loc><lastmod>2026-09-21</lastmod><xhtml:link`
    )
    expect(xml).toContain(`<url><loc>${siteUrl}/pt</loc><xhtml:link`)
    // Fonte de `blog/[slug]`: barra final normalizada e data inválida omitida.
    expect(xml).toContain(
      `<url><loc>${siteUrl}/pt/blog/primeiro-post</loc><lastmod>2026-09-10</lastmod><xhtml:link`
    )
    expect(xml).toContain(
      `<url><loc>${siteUrl}/pt/blog/segundo-post</loc><xhtml:link`
    )
    expect(xml).not.toContain('ontem')
    expect(xml).not.toContain('/private')
    expect(xml).not.toContain('/seo-noindex')
    expect(xml).not.toContain('404')

    const robots = await request.get('/robots.txt')
    expect(robots.status()).toBe(HTTP_OK)
    expect(robots.headers()['content-type']).toContain('text/plain')
    expect(robots.headers()['cache-control']).toBe(cacheControl)

    const llms = await request.get('/llms.txt')
    expect(llms.status()).toBe(HTTP_OK)
    const markdown = await llms.text()
    expect(markdown.startsWith('# ')).toBe(true)
    expect(markdown).toContain(
      `> ${SITE_DESCRIPTION}\n\n- Content is available in English (/en), Portuguese (/pt), and Spanish (/es). This index uses English.\n`
    )
    expect(markdown.indexOf('- Content is available')).toBeLessThan(
      markdown.indexOf('## ')
    )
    const useCases = markdown.split('## When to use\n\n')[1]?.split('\n## ')[0]
    expect(useCases).toContain(`](${siteUrl}/en/index.md): `)
    expect(useCases).toContain(`](${siteUrl}/en/about.md): `)
    expect(markdown.indexOf('## When to use\n')).toBeLessThan(
      markdown.indexOf('## Pages\n')
    )
    expect(markdown).toContain(
      `- [${HOME_TITLE}](${siteUrl}/en/index.md): ${SITE_DESCRIPTION}\n`
    )
    expect(markdown).toContain(
      `## Guias\n\n- [Guia público](${siteUrl}/en/seo-public): Conteúdo público do guia.\n`
    )
    expect(markdown).toContain(
      `## Optional\n\n- [Dados do backend](${siteUrl}/en/backend-error): Página de testes para os estados de resposta do backend.\n`
    )
    expect(markdown.indexOf('## Optional')).toBeGreaterThan(
      markdown.indexOf('## Guias')
    )
    const sitemapUrls = [...xml.matchAll(/<loc>(?<url>[^<]+)<\/loc>/gu)].map(
      match => match.groups?.url
    )
    const indexedPages = markdown.slice(markdown.indexOf('## Pages\n'))
    const llmsUrls = [
      ...indexedPages.matchAll(/^- \[[^\]]+\]\((?<url>[^)]+)\)/gmu)
    ].map(match => match.groups?.url)
    const markdownUrls = new Map([
      [`${siteUrl}/en`, `${siteUrl}/en/index.md`],
      [`${siteUrl}/en/about`, `${siteUrl}/en/about.md`],
      [`${siteUrl}/en/contact`, `${siteUrl}/en/contact.md`],
      [`${siteUrl}/en/privacy`, `${siteUrl}/en/privacy.md`]
    ])
    // Páginas indexáveis sem `route.info.llms`: só no sitemap.
    const sitemapOnly = new Set([
      `${siteUrl}/en/seo-sitemap-only`,
      `${siteUrl}/en/seo-article`,
      `${siteUrl}/en/structured-data-stream`,
      `${siteUrl}/en/fragment-css`,
      `${siteUrl}/en/markdown-optout`
    ])
    expect(new Set(llmsUrls)).toStrictEqual(
      new Set([
        ...sitemapUrls
          .filter(
            url =>
              String(url).startsWith(`${siteUrl}/en`) &&
              !sitemapOnly.has(String(url)) &&
              !String(url).startsWith(`${siteUrl}/en/blog/`) &&
              !String(url).startsWith(`${siteUrl}/en/catalog/`)
          )
          .map(url => markdownUrls.get(String(url)) ?? url),
        `${siteUrl}/llms-full.txt`
      ])
    )
    // Uma entrada da fonte com caminho errado só apareceria no Search Console.
    // As URLs usam a origem pública; o servidor de teste responde pelo caminho.
    const blogPaths = sitemapUrls
      .map(url => String(url).slice(siteUrl.length))
      .filter(path => path.startsWith('/pt/blog/'))
    expect(blogPaths).toHaveLength(BLOG_ENTRIES)
    for (const path of blogPaths) {
      const page = await request.get(path)
      expect(page.status(), path).toBe(HTTP_OK)
    }
    expect(new Set(llmsUrls).size).toBe(llmsUrls.length)
    expect(markdown).not.toContain('/seo-sitemap-only')
    expect(markdown).not.toContain('/structured-data-stream')
    expect(markdown).not.toContain('/seo-noindex')
    expect(markdown).not.toContain('404')
  })
})
