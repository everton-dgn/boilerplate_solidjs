import { locales } from '@paraglide/runtime.js'

import type { SitemapEntry } from '@/@types/sitemap.ts'
import { HTTP_NOT_FOUND, HTTP_OK } from '@/constants/http.ts'

import { SITEMAP_BYTE_LIMIT, SITEMAP_URL_LIMIT } from '../../../constants.ts'
import { buildSitemap } from '../../buildSitemap/index.ts'
import { matchSitemapRoute } from '../../matchSitemapRoute/index.ts'
import {
  buildSitemapIndexResponse,
  buildSitemapPartResponse
} from '../index.ts'

const siteUrl = 'https://example.com'
const { signal } = new AbortController()
const matchRoute = matchSitemapRoute([
  { path: '/blog/:slug', page: true },
  { path: '/blog/static', page: true },
  { path: '/about', page: true }
])
const entries = [{ path: '/blog/static', lastmod: '2026-01-01' }]
const legacyEntry = { path: '/blog/legacy' }
const manifest = {
  entries,
  sources: [() => [legacyEntry]],
  sourceRoutes: ['/blog/:slug'],
  dynamicRoutes: [{ path: '/blog/:slug', isIndexable: true }]
}
const options = { manifest, sources: [], siteUrl, signal, matchRoute }
const encoder = new TextEncoder()

describe('compatibilidade do sitemap legado com partes estáticas', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockReturnValue()
  })

  afterEach(() => vi.restoreAllMocks())

  it.each(['/blog/static', '/about'])(
    'descarta a duplicata estática %s sem publicar os metadados legados',
    async staticPath => {
      const context = {
        ...options,
        manifest: {
          ...manifest,
          entries: [{ path: staticPath, lastmod: '2026-01-01' }],
          sources: [
            () => [
              { path: `/pt${staticPath}`, lastmod: '2026-02-02' },
              legacyEntry
            ]
          ]
        }
      }
      const root = await buildSitemapIndexResponse(context)
      expect(root.status).toBe(HTTP_OK)
      const xml = await root.text()
      expect(xml.match(/<lastmod>[^<]*<\/lastmod>/gu)).toStrictEqual(
        locales.map(() => '<lastmod>2026-01-01</lastmod>')
      )
      expect(xml.match(/<loc>/gu)).toHaveLength(
        locales.length * [entries[0], legacyEntry].length
      )
      const part = await buildSitemapPartResponse({
        ...context,
        kind: 'legacy',
        part: 'legacy'
      })
      expect(part.status).toBe(HTTP_OK)
      const partXml = await part.text()
      expect(partXml.match(/<loc>[^<]*<\/loc>/gu)).toStrictEqual(
        locales.map(locale => `<loc>${siteUrl}/${locale}/blog/legacy</loc>`)
      )
    }
  )

  it.each([
    { values: [] },
    { values: [{ path: '/blog/static' }] },
    { values: [{ path: '/about' }] }
  ])('omite uma parte legada sem entradas próprias', async ({ values }) => {
    const readLegacy = vi.fn<() => SitemapEntry[]>(() => values)
    const pages = [...entries, { path: '/about' }]
    const byteBudget = Math.max(
      ...pages.map(
        entry =>
          encoder.encode(buildSitemap({ entries: [entry], siteUrl })).byteLength
      )
    )
    const context = {
      ...options,
      byteBudget,
      manifest: { ...manifest, entries: pages, sources: [readLegacy] }
    }
    const root = await buildSitemapIndexResponse(context)
    expect(root.status).toBe(HTTP_OK)
    const xml = await root.text()
    expect(xml).toContain('<sitemapindex')
    expect(xml).not.toContain('/sitemaps/legacy.xml')
    expect(readLegacy).toHaveBeenCalledOnce()
    const part = await buildSitemapPartResponse({
      ...context,
      kind: 'legacy',
      part: 'legacy'
    })
    expect({
      status: part.status,
      cacheControl: part.headers.get('cache-control')
    }).toStrictEqual({ status: HTTP_NOT_FOUND, cacheControl: 'no-store' })
  })

  it('publica índice quando estáticos e legado cabem separados, mas a união excede bytes', async () => {
    const readLegacy = vi.fn<() => SitemapEntry[]>(() => [legacyEntry])
    const byteBudget = Math.max(
      ...[entries, [legacyEntry]].map(
        part =>
          encoder.encode(buildSitemap({ entries: part, siteUrl })).byteLength
      )
    )
    const context = {
      ...options,
      byteBudget,
      manifest: { ...manifest, sources: [readLegacy] }
    }
    const root = await buildSitemapIndexResponse(context)
    expect(root.status).toBe(HTTP_OK)
    const xml = await root.text()
    expect(xml).toContain('/sitemaps/pages/1.xml')
    expect(xml).toContain('/sitemaps/legacy.xml')
    expect(readLegacy).toHaveBeenCalledOnce()
    for (const kind of ['pages', 'legacy'] as const) {
      const part = await buildSitemapPartResponse({
        ...context,
        kind,
        part: '1'
      })
      expect(part.status).toBe(HTTP_OK)
      const body = await part.arrayBuffer()
      expect(body.byteLength).toBeLessThanOrEqual(byteBudget)
    }
  })

  it(
    'publica índice quando só a união excede a contagem',
    { timeout: 30_000 },
    async () => {
      const count = Math.floor(SITEMAP_URL_LIMIT / locales.length)
      const pages = Array.from({ length: count }, (_, index) => ({
        path: `/page-${index}`
      }))
      const root = await buildSitemapIndexResponse({
        ...options,
        byteBudget: SITEMAP_BYTE_LIMIT,
        manifest: { ...manifest, entries: pages }
      })
      expect(root.status).toBe(HTTP_OK)
      const xml = await root.text()
      expect(xml).toContain('/sitemaps/pages/1.xml')
      expect(xml).toContain('/sitemaps/legacy.xml')
    }
  )
})
