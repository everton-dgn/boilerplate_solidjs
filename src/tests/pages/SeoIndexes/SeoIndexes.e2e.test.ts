import { expect, test } from '@playwright/test'

import { readSiteOrigin } from '@/tests/helpers/readSiteOrigin/index.ts'

const HTTP_OK = 200
const SITE_TITLE = 'SolidJS Boilerplate'
const SITE_DESCRIPTION =
  'Uma base para aplicações web com SolidJS, TypeScript e Vite+, com renderização no servidor e temas claro e escuro.'

test.describe('índices gerados do manifesto de rotas', () => {
  test('gera sitemap, robots e llms.txt a partir do manifesto de rotas', async ({
    request
  }) => {
    const siteUrl = readSiteOrigin()
    const cacheControl = 'public, max-age=3600'

    const sitemap = await request.get('/sitemap.xml')
    expect(sitemap.status()).toBe(HTTP_OK)
    expect(sitemap.headers()['content-type']).toContain('application/xml')
    expect(sitemap.headers()['cache-control']).toBe(cacheControl)
    const xml = await sitemap.text()
    expect(xml).toContain(`<loc>${siteUrl}/</loc>`)
    expect(xml).toContain(`<loc>${siteUrl}/backend-error</loc>`)
    expect(xml).toContain(`<loc>${siteUrl}/seo-public</loc>`)
    expect(xml).toContain(`<loc>${siteUrl}/seo-sitemap-only</loc>`)
    expect(xml).toContain(`<loc>${siteUrl}/seo-article</loc>`)
    expect(xml).not.toContain('/seo-noindex')
    expect(xml).not.toContain('404')

    const robots = await request.get('/robots.txt')
    expect(robots.status()).toBe(HTTP_OK)
    expect(robots.headers()['content-type']).toContain('text/plain')
    expect(robots.headers()['cache-control']).toBe(cacheControl)
    await expect(robots.text()).resolves.toBe(
      `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`
    )

    const llms = await request.get('/llms.txt')
    expect(llms.status()).toBe(HTTP_OK)
    expect(llms.headers()['content-type']).toContain('text/markdown')
    expect(llms.headers()['cache-control']).toBe(cacheControl)
    const markdown = await llms.text()
    expect(markdown.startsWith('# ')).toBe(true)
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
    expect(new Set(llmsUrls)).toStrictEqual(
      new Set(
        sitemapUrls.filter(
          url =>
            url !== `${siteUrl}/seo-sitemap-only` &&
            url !== `${siteUrl}/seo-article`
        )
      )
    )
    expect(new Set(llmsUrls).size).toBe(llmsUrls.length)
    expect(markdown).not.toContain('/seo-sitemap-only')
    expect(markdown).not.toContain('/seo-noindex')
    expect(markdown).not.toContain('404')
  })
})
