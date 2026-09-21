import { expect, type Page, test } from '@playwright/test'

import {
  parseStructuredData,
  type StructuredData
} from '@/tests/helpers/parseStructuredData/index.ts'
import { readSiteOrigin } from '@/tests/helpers/readSiteOrigin/index.ts'

const HTTP_OK = 200
const SITE_TITLE = 'SolidJS Boilerplate'
const SITE_DESCRIPTION =
  'Uma base para aplicações web com SolidJS, TypeScript e Vite+, com renderização no servidor e temas claro e escuro.'
const SITE_IMAGE_ALT = 'Logo do SolidJS sobre o título SolidJS Boilerplate'
const ROBOTS_INDEX = 'index, follow, max-image-preview:large'
const SOCIAL_TAGS = 'head meta[property^="og:"], head meta[name^="twitter:"]'
// Grafo base do SeoHead mais o script próprio da página.
const SCRIPTS_WITH_PAGE_DATA = 2
// WebSite, página e Organization; a ordem não importa em JSON-LD.
const BASE_GRAPH_NODES = 3

// Só os campos que identificam cada nó; o formato completo é coberto pelos
// testes unitários de `buildStructuredData`.
async function readStructuredData(
  page: Page
): Promise<StructuredData['@graph']> {
  const json = await page
    .locator('head script[type="application/ld+json"]')
    .textContent()
  return parseStructuredData(json)['@graph']
}

function readServerScripts(html: string): string[] {
  const head = html.split('</head>')[0] ?? ''
  return [
    ...head.matchAll(
      /<script\b[^>]*type="application\/ld\+json"[^>]*>(?<json>[\s\S]*?)<\/script>/gu
    )
  ].map(match => match.groups?.json ?? '')
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
    const describedBy = page.locator('head link[rel="describedby"]')
    await expect(describedBy).toHaveAttribute('href', '/llms.txt')
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
    const graph = await readStructuredData(page)
    const logoNode = expect.objectContaining({
      url: `${siteUrl}/favicon/apple-touch-icon.png`
    })
    const baseNodes = [
      { '@type': 'WebSite', url: `${siteUrl}/`, name: SITE_TITLE },
      { '@type': 'WebPage', url: `${siteUrl}/`, name: SITE_TITLE },
      {
        '@type': 'Organization',
        url: `${siteUrl}/`,
        name: SITE_TITLE,
        logo: logoNode
      }
    ].map(node => expect.objectContaining(node))
    expect(graph).toHaveLength(BASE_GRAPH_NODES)
    expect(graph).toEqual(expect.arrayContaining(baseNodes))
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      ROBOTS_INDEX
    )

    const image = await page.request.get('/images/og.png')
    expect(image.status()).toBe(HTTP_OK)
    expect(image.headers()['content-type']).toContain('image/png')
    const logo = await page.request.get('/favicon/apple-touch-icon.png')
    expect(logo.status()).toBe(HTTP_OK)

    await page.getByRole('link', { name: '404', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Página não encontrada!' })
    ).toBeVisible()
    await expect(page).toHaveTitle('Página não encontrada')
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
      'content',
      'A página solicitada não foi encontrada.'
    )
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex'
    )
    await expect(canonical).toHaveCount(0)
    await expect(page.locator(SOCIAL_TAGS)).toHaveCount(0)
    await expect(
      page.locator('head script[type="application/ld+json"]')
    ).toHaveCount(0)

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
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      ROBOTS_INDEX
    )
    await expect(
      page.locator('head script[type="application/ld+json"]')
    ).toHaveCount(1)
    expect(await readStructuredData(page)).toContainEqual(
      expect.objectContaining({ '@type': 'WebPage', url: `${siteUrl}/` })
    )
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
    ).toHaveAttribute('content', `${siteUrl}/favicon/apple-touch-icon.png`)
    await expect(
      page.locator('head meta[name="twitter:image"]')
    ).toHaveAttribute('content', `${siteUrl}/favicon/apple-touch-icon.png`)
    await expect(
      page.locator('head meta[property="og:image:alt"]')
    ).toHaveAttribute('content', 'Capa do artigo de exemplo')
    await expect(
      page.locator('head meta[property="og:image:width"]')
    ).toHaveAttribute('content', '180')
    await expect(
      page.locator('head meta[property="article:published_time"]')
    ).toHaveAttribute('content', '2026-09-01')
    await expect(
      page.locator('head meta[property="article:modified_time"]')
    ).toHaveAttribute('content', '2026-09-21')
    expect(await readStructuredData(page)).toContainEqual(
      expect.objectContaining({
        '@type': 'Article',
        url: `${siteUrl}/seo-article`,
        name: 'Artigo de exemplo',
        datePublished: '2026-09-01',
        dateModified: '2026-09-21',
        publisher: { '@id': `${siteUrl}/#organization` }
      })
    )

    await page.getByRole('link', { name: 'Início', exact: true }).click()
    await expect(page.locator('head meta[property="og:type"]')).toHaveAttribute(
      'content',
      'website'
    )
    await expect(page.locator('head meta[property^="article:"]')).toHaveCount(0)
  })

  test('publica o JSON-LD próprio da página ao lado do grafo base', async ({
    page,
    request
  }) => {
    const response = await request.get('/structured-data')
    expect(response.status()).toBe(HTTP_OK)
    const serverScripts = readServerScripts(await response.text())
    expect(serverScripts).toHaveLength(SCRIPTS_WITH_PAGE_DATA)
    expect(
      serverScripts.filter(text => text.includes('"@type":"FAQPage"'))
    ).toHaveLength(1)

    await page.goto('/structured-data')

    const scripts = page.locator('head script[type="application/ld+json"]')
    await expect(scripts).toHaveCount(SCRIPTS_WITH_PAGE_DATA)
    const texts = await scripts.allTextContents()
    expect(
      texts.filter(text => text.includes('"@type":"WebSite"'))
    ).toHaveLength(1)
    expect(
      texts.filter(text => text.includes('"@type":"FAQPage"'))
    ).toHaveLength(1)

    await page.getByRole('link', { name: 'Início', exact: true }).click()
    await expect(page).toHaveTitle(SITE_TITLE)
    await expect(scripts).toHaveCount(1)
    const remaining = await scripts.allTextContents()
    expect(remaining.filter(text => text.includes('FAQPage'))).toHaveLength(0)
  })
})
