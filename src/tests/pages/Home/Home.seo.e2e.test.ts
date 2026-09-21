import { expect, test } from '@playwright/test'
import * as v from 'valibot'

import { readSiteOrigin } from '@/tests/helpers/readSiteOrigin/index.ts'

const HTTP_OK = 200
const SITE_TITLE = 'SolidJS Boilerplate'
const SITE_DESCRIPTION =
  'Uma base para aplicações web com SolidJS, TypeScript e Vite+, com renderização no servidor e temas claro e escuro.'
const SITE_IMAGE_ALT = 'Logo do SolidJS sobre o título SolidJS Boilerplate'

const NodeSchema = v.object({
  '@type': v.string(),
  url: v.string(),
  name: v.string()
})
const StructuredDataSchema = v.object({ '@graph': v.array(NodeSchema) })

// Só os campos que identificam cada nó; o formato completo é coberto pelos
// testes unitários de `buildStructuredData`.
function readStructuredData(json: string | null) {
  return v.parse(StructuredDataSchema, JSON.parse(json ?? 'null'))['@graph']
}

test.describe('metadados de SEO', () => {
  test('publica canonical, Open Graph e imagem social por rota', async ({
    page
  }) => {
    const siteUrl = readSiteOrigin()
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
    await expect(page.locator('head meta[property="og:type"]')).toHaveCount(1)
    await expect(page.locator('head meta[property="og:type"]')).toHaveAttribute(
      'content',
      'website'
    )
    await expect(
      page.locator('head meta[name="twitter:image:alt"]')
    ).toHaveAttribute('content', SITE_IMAGE_ALT)
    await expect(
      page.locator('head script[type="application/ld+json"]')
    ).toHaveCount(1)
    expect(
      readStructuredData(
        await page
          .locator('head script[type="application/ld+json"]')
          .textContent()
      )
    ).toStrictEqual([
      { '@type': 'WebSite', url: `${siteUrl}/`, name: SITE_TITLE },
      { '@type': 'WebPage', url: `${siteUrl}/`, name: SITE_TITLE }
    ])
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

  test('publica tipo, imagem e JSON-LD declarados pela rota', async ({
    page
  }) => {
    const siteUrl = readSiteOrigin()
    await page.goto('/seo-article')

    await expect(page).toHaveTitle('Artigo de exemplo')
    await expect(page.locator('head meta[property="og:type"]')).toHaveAttribute(
      'content',
      'article'
    )
    await expect(
      page.locator('head meta[property="og:image"]')
    ).toHaveAttribute('content', `${siteUrl}/images/article.png`)
    await expect(
      page.locator('head meta[name="twitter:image"]')
    ).toHaveAttribute('content', `${siteUrl}/images/article.png`)
    await expect(
      page.locator('head meta[property="og:image:alt"]')
    ).toHaveAttribute('content', 'Capa do artigo de exemplo')
    await expect(
      page.locator('head meta[property="og:image:width"]')
    ).toHaveAttribute('content', '1200')
    expect(
      readStructuredData(
        await page
          .locator('head script[type="application/ld+json"]')
          .textContent()
      )[1]
    ).toStrictEqual({
      '@type': 'Article',
      url: `${siteUrl}/seo-article`,
      name: 'Artigo de exemplo'
    })
  })
})
