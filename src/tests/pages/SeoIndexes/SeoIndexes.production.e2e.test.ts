import { expect, test } from '@playwright/test'

import { readSiteOrigin } from '@/tests/helpers/readSiteOrigin/index.ts'

const HTTP_OK = 200
const HTTP_NOT_FOUND = 404
const CACHE_CONTROL = 'public, max-age=3600'
// Grupo dos robôs de treinamento de IA: começa em GPTBot e termina bloqueando tudo.
const AI_BOTS_GROUP =
  /\nUser-agent: GPTBot\n(?:User-agent: [^\n]+\n)*Disallow: \/\n/u

test.describe('índices na árvore real de produção', () => {
  test('serve sitemap.xml sem redirecionamento', async ({ request }) => {
    const response = await request.get('/sitemap.xml', { maxRedirects: 0 })
    expect(response.status()).toBe(HTTP_OK)
    expect(response.headers()['content-type']).toContain('application/xml')
    expect(response.headers()['cache-control']).toBe(CACHE_CONTROL)
    const xml = await response.text()
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    )
    expect(xml).toContain(`<loc>${readSiteOrigin()}/</loc>`)
    expect(xml).toContain('</urlset>')
    expect(xml).not.toContain('/helpers/')
    expect(xml).not.toContain('(seo)')
  })

  test('serve robots.txt sem redirecionamento', async ({ request }) => {
    const response = await request.get('/robots.txt', { maxRedirects: 0 })
    expect(response.status()).toBe(HTTP_OK)
    expect(response.headers()['content-type']).toContain('text/plain')
    expect(response.headers()['cache-control']).toBe(CACHE_CONTROL)
    const text = await response.text()
    expect(
      text.startsWith('User-agent: *\nAllow: /\nDisallow: /_server\n')
    ).toBe(true)
    expect(text).toMatch(AI_BOTS_GROUP)
    expect(text.endsWith(`\nSitemap: ${readSiteOrigin()}/sitemap.xml\n`)).toBe(
      true
    )
  })

  test('serve llms.txt sem redirecionamento', async ({ request }) => {
    const response = await request.get('/llms.txt', { maxRedirects: 0 })
    expect(response.status()).toBe(HTTP_OK)
    expect(response.headers()['content-type']).toContain('text/markdown')
    expect(response.headers()['cache-control']).toBe(CACHE_CONTROL)
    const markdown = await response.text()
    expect(markdown).toMatch(/^# .+\n/u)
    expect(markdown).toContain('## Páginas\n')
    expect(markdown).toContain(`](${readSiteOrigin()}/)`)
    expect(markdown).not.toContain('/helpers/')
    expect(markdown).not.toContain('(seo)')
  })

  for (const path of [
    '/llms.txt/helpers',
    '/llms.txt/helpers/buildLlmsText',
    '/llms.txt/helpers/collectLlmsPages',
    '/robots.txt/buildRobotsText',
    '/sitemap.xml/helpers',
    '/sitemap.xml/helpers/buildSitemap',
    '/sitemap.xml/helpers/collectStaticPaths'
  ]) {
    test(`não publica o helper ${path}`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status()).toBe(HTTP_NOT_FOUND)
    })
  }

  test('não inclui a árvore de fixtures E2E', async ({ request }) => {
    const response = await request.get('/seo-public', { maxRedirects: 0 })
    expect(response.status()).toBe(HTTP_NOT_FOUND)
  })
})
