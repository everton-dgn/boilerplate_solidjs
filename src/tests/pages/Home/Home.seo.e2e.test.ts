import { env } from 'node:process'

import { expect, test } from '@playwright/test'

const HTTP_OK = 200

test.describe('metadados de SEO', () => {
  test('publica canonical, Open Graph e imagem social por rota', async ({
    page,
    baseURL
  }) => {
    const siteUrl = new URL(env.VITE_SITE_URL ?? String(baseURL)).origin
    await page.goto('/')

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
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex'
    )

    await page.getByRole('link', { name: 'Início', exact: true }).click()
    await expect(canonical).toHaveAttribute('href', `${siteUrl}/`)
    await expect(page.locator('head meta[name="robots"]')).toHaveCount(0)
  })

  test('gera sitemap, robots e llms.txt a partir do manifesto de rotas', async ({
    request,
    baseURL
  }) => {
    const siteUrl = new URL(env.VITE_SITE_URL ?? String(baseURL)).origin

    const sitemap = await request.get('/sitemap.xml')
    expect(sitemap.status()).toBe(HTTP_OK)
    expect(sitemap.headers()['content-type']).toContain('application/xml')
    const xml = await sitemap.text()
    expect(xml).toContain(`<loc>${siteUrl}/</loc>`)
    expect(xml).toContain(`<loc>${siteUrl}/backend-error</loc>`)
    expect(xml).not.toContain('404')

    const robots = await request.get('/robots.txt')
    expect(robots.status()).toBe(HTTP_OK)
    expect(robots.headers()['content-type']).toContain('text/plain')
    await expect(robots.text()).resolves.toBe(
      `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`
    )

    const llms = await request.get('/llms.txt')
    expect(llms.status()).toBe(HTTP_OK)
    expect(llms.headers()['content-type']).toContain('text/markdown')
    const markdown = await llms.text()
    expect(markdown.startsWith('# ')).toBe(true)
    expect(markdown).toContain(`- [/](${siteUrl}/)`)
    expect(markdown).toContain(`- [/backend-error](${siteUrl}/backend-error)`)
    expect(markdown).not.toContain('404')
  })
})
