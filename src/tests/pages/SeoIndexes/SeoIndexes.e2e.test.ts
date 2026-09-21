import { expect, test } from '@playwright/test'

import { readSiteOrigin } from '@/tests/helpers/readSiteOrigin/index.ts'

const HTTP_OK = 200
// Entradas publicadas pela fonte de `blog/[slug]`.
const BLOG_ENTRIES = 2
const SITE_TITLE = 'SolidJS Boilerplate'
const SITE_DESCRIPTION =
  'Uma base para aplicações web com SolidJS, TypeScript e Vite+, com renderização no servidor e temas claro e escuro.'
// Grupo dos robôs de treinamento de IA: começa em GPTBot e termina bloqueando tudo.
const AI_BOTS_GROUP =
  /\nUser-agent: GPTBot\n(?:User-agent: [^\n]+\n)*Disallow: \/\n/u

test.describe('índices gerados do manifesto de rotas', () => {
  test('gera sitemap, robots e llms.txt a partir do manifesto de rotas', async ({
    request
  }) => {
    const siteUrl = readSiteOrigin()
    const cacheControl = 'public, max-age=0, s-maxage=3600'

    const sitemap = await request.get('/sitemap.xml')
    expect(sitemap.status()).toBe(HTTP_OK)
    expect(sitemap.headers()['content-type']).toContain('application/xml')
    expect(sitemap.headers()['cache-control']).toBe(cacheControl)
    const xml = await sitemap.text()
    expect(xml).toContain(`<loc>${siteUrl}/</loc>`)
    expect(xml).toContain(`<loc>${siteUrl}/backend-error</loc>`)
    expect(xml).toContain(`<loc>${siteUrl}/seo-public</loc>`)
    expect(xml).toContain(`<loc>${siteUrl}/seo-sitemap-only</loc>`)
    expect(xml).toContain(
      `<url><loc>${siteUrl}/seo-article</loc><lastmod>2026-09-21</lastmod></url>`
    )
    expect(xml).toContain(`<url><loc>${siteUrl}/</loc></url>`)
    // Fonte de `blog/[slug]`: barra final normalizada e data inválida omitida.
    expect(xml).toContain(
      `<url><loc>${siteUrl}/blog/primeiro-post</loc><lastmod>2026-09-10</lastmod></url>`
    )
    expect(xml).toContain(`<url><loc>${siteUrl}/blog/segundo-post</loc></url>`)
    expect(xml).not.toContain('ontem')
    expect(xml).not.toContain('/private')
    expect(xml).not.toContain('/seo-noindex')
    expect(xml).not.toContain('404')

    const robots = await request.get('/robots.txt')
    expect(robots.status()).toBe(HTTP_OK)
    expect(robots.headers()['content-type']).toContain('text/plain')
    expect(robots.headers()['cache-control']).toBe(cacheControl)
    const robotsText = await robots.text()
    expect(
      robotsText.startsWith('User-agent: *\nAllow: /\nDisallow: /_server\n')
    ).toBe(true)
    expect(robotsText).toMatch(AI_BOTS_GROUP)
    expect(robotsText.endsWith(`\nSitemap: ${siteUrl}/sitemap.xml\n`)).toBe(
      true
    )

    const llms = await request.get('/llms.txt')
    expect(llms.status()).toBe(HTTP_OK)
    expect(llms.headers()['content-type']).toContain('text/markdown')
    expect(llms.headers()['cache-control']).toBe(cacheControl)
    const markdown = await llms.text()
    expect(markdown.startsWith('# ')).toBe(true)
    expect(markdown).toContain(
      `> ${SITE_DESCRIPTION}\n\n- O conteúdo do site está em português do Brasil.\n`
    )
    expect(markdown.indexOf('- O conteúdo do site')).toBeLessThan(
      markdown.indexOf('## ')
    )
    expect(markdown).toContain(
      `## Páginas\n\n- [${SITE_TITLE}](${siteUrl}/): ${SITE_DESCRIPTION}\n`
    )
    expect(markdown).toContain(
      `## Guias\n\n- [Guia público](${siteUrl}/seo-public): Conteúdo público do guia.\n`
    )
    expect(markdown).toContain(
      `## Optional\n\n- [Dados do backend](${siteUrl}/backend-error): Página de testes para os estados de resposta do backend.\n`
    )
    expect(markdown.indexOf('## Optional')).toBeGreaterThan(
      markdown.indexOf('## Guias')
    )
    const sitemapUrls = [...xml.matchAll(/<loc>(?<url>[^<]+)<\/loc>/gu)].map(
      match => match.groups?.url
    )
    const llmsUrls = [
      ...markdown.matchAll(/^- \[[^\]]+\]\((?<url>[^)]+)\)/gmu)
    ].map(match => match.groups?.url)
    // Páginas indexáveis sem `route.info.llms`: só no sitemap.
    const sitemapOnly = new Set([
      `${siteUrl}/seo-sitemap-only`,
      `${siteUrl}/seo-article`,
      `${siteUrl}/structured-data-stream`
    ])
    expect(new Set(llmsUrls)).toStrictEqual(
      new Set(
        sitemapUrls.filter(
          url =>
            !sitemapOnly.has(String(url)) &&
            !String(url).startsWith(`${siteUrl}/blog/`)
        )
      )
    )
    // Uma entrada da fonte com caminho errado só apareceria no Search Console.
    // As URLs usam a origem pública; o servidor de teste responde pelo caminho.
    const blogPaths = sitemapUrls
      .map(url => String(url).slice(siteUrl.length))
      .filter(path => path.startsWith('/blog/'))
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
