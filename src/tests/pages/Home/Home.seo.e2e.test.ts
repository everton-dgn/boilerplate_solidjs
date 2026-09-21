import { env } from 'node:process'

import { expect, test } from '@playwright/test'

const HTTP_OK = 200
const SITE_TITLE = 'SolidJS Boilerplate'
const SITE_DESCRIPTION =
  'Uma base para aplicações web com SolidJS, TypeScript e Vite+, com renderização no servidor e temas claro e escuro.'

test.describe('metadados de SEO', () => {
  test('publica canonical, Open Graph e imagem social por rota', async ({
    page
  }) => {
    const siteUrl = new URL(String(env.VITE_SITE_URL)).origin
    await page.goto('/')
    await expect(page).toHaveTitle(SITE_TITLE)
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
      'content',
      SITE_DESCRIPTION
    )
    await expect(
      page.locator('head meta[property="og:title"]')
    ).toHaveAttribute('content', SITE_TITLE)

    const canonical = page.locator('head link[rel="canonical"]')
    await expect(canonical).toHaveAttribute('href', `${siteUrl}/`)
    await expect(page.locator('head meta[property="og:url"]')).toHaveAttribute(
      'content',
      `${siteUrl}/`
    )
    await expect(
      page.locator('head meta[property="og:image"]')
    ).toHaveAttribute('content', `${siteUrl}/images/og.png`)
    await expect(
      page.locator('head meta[name="twitter:card"]')
    ).toHaveAttribute('content', 'summary_large_image')
    await expect(page.locator('head meta[name="robots"]')).toHaveCount(0)

    const image = await page.request.get('/images/og.png')
    expect(image.status()).toBe(HTTP_OK)
    expect(image.headers()['content-type']).toContain('image/png')

    await page.getByRole('link', { name: '404', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Página não encontrada!' })
    ).toBeVisible()
    await expect(canonical).toHaveAttribute('href', `${siteUrl}/404`)
    await expect(page).toHaveTitle('Página não encontrada')
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
      'content',
      'A página solicitada não foi encontrada.'
    )
    await expect(
      page.locator('head meta[property="og:title"]')
    ).toHaveAttribute('content', 'Página não encontrada')
    await expect(
      page.locator('head meta[name="twitter:description"]')
    ).toHaveAttribute('content', 'A página solicitada não foi encontrada.')
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex'
    )

    await page.getByRole('link', { name: 'Início', exact: true }).click()
    await expect(canonical).toHaveAttribute('href', `${siteUrl}/`)
    await expect(page).toHaveTitle(SITE_TITLE)
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
      'content',
      SITE_DESCRIPTION
    )
    await expect(
      page.locator('head meta[property="og:title"]')
    ).toHaveAttribute('content', SITE_TITLE)
    await expect(
      page.locator('head meta[name="twitter:description"]')
    ).toHaveAttribute('content', SITE_DESCRIPTION)
    await expect(page.locator('head meta[name="robots"]')).toHaveCount(0)
  })

  test('gera sitemap, robots e llms.txt a partir do manifesto de rotas', async ({
    request
  }) => {
    const siteUrl = new URL(String(env.VITE_SITE_URL)).origin
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
      new Set(sitemapUrls.filter(url => url !== `${siteUrl}/seo-sitemap-only`))
    )
    expect(new Set(llmsUrls).size).toBe(llmsUrls.length)
    expect(markdown).not.toContain('/seo-sitemap-only')
    expect(markdown).not.toContain('/seo-noindex')
    expect(markdown).not.toContain('404')
  })

  test('publica noindex no HTML de uma rota estática sem depender de JavaScript', async ({
    browser,
    baseURL
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      baseURL
    })
    try {
      const page = await context.newPage()
      await page.goto('/seo-noindex')
      await expect(page).toHaveTitle('Página utilitária')
      await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex'
      )
    } finally {
      await context.close()
    }
  })
})
