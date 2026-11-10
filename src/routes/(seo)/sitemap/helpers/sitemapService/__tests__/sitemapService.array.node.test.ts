import { locales } from '@paraglide/runtime.js'

import type { SitemapEntry } from '@/@types/sitemap.ts'
import { HTTP_NOT_FOUND, HTTP_OK } from '@/constants/http.ts'
import type { PublicationOptions } from '@/infra/server/publication/types.ts'

import { SITEMAP_BYTE_LIMIT, SITEMAP_URL_LIMIT } from '../../../constants.ts'
import { buildSitemap } from '../../buildSitemap/index.ts'
import { matchSitemapRoute } from '../../matchSitemapRoute/index.ts'
import {
  buildSitemapIndexResponse,
  buildSitemapPartResponse
} from '../index.ts'

vi.mock(import('../../buildSitemap/index.ts'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    buildSitemap: vi.fn<typeof actual.buildSitemap>(actual.buildSitemap)
  }
})
vi.mock(import('@/infra/server/publication/index.ts'), async importOriginal => {
  const actual = await importOriginal()
  const limits = {
    total: 1,
    sitemap: 1,
    markdown: 1,
    sources: 4,
    perSource: 4,
    outputs: 1,
    reservedBytes: 52_428_800
  }
  return {
    ...actual,
    runPublication: (options: PublicationOptions) =>
      actual.createPublicationController(limits).runPublication(options)
  }
})

const siteUrl = 'https://example.com'
const { signal } = new AbortController()
const matchRoute = matchSitemapRoute([
  { path: '/blog/:slug', page: true },
  { path: '/blog/static', page: true },
  { path: '/about', page: true }
])
const entries = [{ path: '/blog/static', lastmod: '2026-01-01' }]
const arrayEntry = { path: '/blog/array' }
const manifest = {
  entries,
  sources: [() => [arrayEntry]],
  sourceRoutes: ['/blog/:slug'],
  dynamicRoutes: [{ path: '/blog/:slug', isIndexable: true }]
}
const options = { manifest, sources: [], siteUrl, signal, matchRoute }
const encoder = new TextEncoder()

describe('fontes em array com partes estáticas', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockReturnValue()
  })

  afterEach(() => vi.restoreAllMocks())

  it.each(['/blog/static', '/about'])(
    'descarta a duplicata estática %s sem publicar os metadados da fonte em array',
    async staticPath => {
      const context = {
        ...options,
        manifest: {
          ...manifest,
          entries: [{ path: staticPath, lastmod: '2026-01-01' }],
          sources: [
            () => [
              { path: `/pt${staticPath}`, lastmod: '2026-02-02' },
              arrayEntry
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
        locales.length * [entries[0], arrayEntry].length
      )
      const part = await buildSitemapPartResponse({
        ...context,
        kind: 'array',
        part: 'array'
      })
      expect(part.status).toBe(HTTP_OK)
      const partXml = await part.text()
      expect(partXml.match(/<loc>[^<]*<\/loc>/gu)).toStrictEqual(
        locales.map(locale => `<loc>${siteUrl}/${locale}/blog/array</loc>`)
      )
    }
  )

  it.each([
    { values: [] },
    { values: [{ path: '/blog/static' }] },
    { values: [{ path: '/about' }] }
  ])('omite a parte de array sem entradas próprias', async ({ values }) => {
    const readArraySource = vi.fn<() => SitemapEntry[]>(() => values)
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
      manifest: { ...manifest, entries: pages, sources: [readArraySource] }
    }
    const root = await buildSitemapIndexResponse(context)
    expect(root.status).toBe(HTTP_OK)
    const xml = await root.text()
    expect(xml).toContain('<sitemapindex')
    expect(xml).not.toContain('/sitemaps/array.xml')
    expect(readArraySource).toHaveBeenCalledOnce()
    const part = await buildSitemapPartResponse({
      ...context,
      kind: 'array',
      part: 'array'
    })
    expect({
      status: part.status,
      cacheControl: part.headers.get('cache-control')
    }).toStrictEqual({ status: HTTP_NOT_FOUND, cacheControl: 'no-store' })
  })

  it('serializa a resposta de array.xml uma única vez', async () => {
    vi.mocked(buildSitemap).mockClear()
    const part = await buildSitemapPartResponse({
      ...options,
      kind: 'array',
      part: 'array'
    })
    expect(part.status).toBe(HTTP_OK)
    await expect(part.text()).resolves.toContain(`${siteUrl}/en/blog/array`)
    expect(buildSitemap).toHaveBeenCalledOnce()
  })

  it('publica índice quando estáticos e fonte em array cabem separados, mas a união excede bytes', async () => {
    const readArraySource = vi.fn<() => SitemapEntry[]>(() => [arrayEntry])
    const byteBudget = Math.max(
      ...[entries, [arrayEntry]].map(
        part =>
          encoder.encode(buildSitemap({ entries: part, siteUrl })).byteLength
      )
    )
    const context = {
      ...options,
      byteBudget,
      manifest: { ...manifest, sources: [readArraySource] }
    }
    const root = await buildSitemapIndexResponse(context)
    expect(root.status).toBe(HTTP_OK)
    const xml = await root.text()
    expect(xml).toContain('/sitemaps/pages/1.xml')
    expect(xml).toContain('/sitemaps/array.xml')
    expect(readArraySource).toHaveBeenCalledOnce()
    for (const kind of ['pages', 'array'] as const) {
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
      expect(xml).toContain('/sitemaps/array.xml')
    }
  )
})
