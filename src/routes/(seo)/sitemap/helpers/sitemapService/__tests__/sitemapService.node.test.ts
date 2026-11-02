import { locales } from '@paraglide/runtime.js'

import type { SitemapPartitionSource } from '@/@types/sitemap.ts'
import {
  HTTP_NOT_FOUND,
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE
} from '@/constants/http.ts'
import type { PublicationOptions } from '@/infra/server/publication/types.ts'

import {
  SITEMAP_BYTE_LIMIT,
  SITEMAP_SOURCES_TIMEOUT_MS,
  SITEMAP_URL_LIMIT
} from '../../../constants.ts'
import { buildSitemap } from '../../buildSitemap/index.ts'
import { matchSitemapRoute } from '../../matchSitemapRoute/index.ts'
import {
  buildSitemapIndexResponse,
  buildSitemapPartResponse
} from '../index.ts'

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

type SitemapPartitionReadOptions = Parameters<
  SitemapPartitionSource['readPartition']
>[0]

const siteUrl = 'https://example.com'
const { signal } = new AbortController()
const LONG_PATH_CHARS = 1000
const matchRoute = matchSitemapRoute([
  { path: '/blog/:slug', page: true },
  { path: '/blog/static', page: true },
  { path: '/stories/*rest', page: true }
])
const manifest = {
  entries: [{ path: '/blog/static' }],
  sources: [],
  dynamicRoutes: [
    { path: '/blog/:slug', isIndexable: true },
    { path: '/stories/*rest', isIndexable: true }
  ]
}

function source(entries: string[]): SitemapPartitionSource {
  return {
    id: 'blog',
    routePath: '/blog/:slug',
    listPartitions: () => Promise.resolve(['first']),
    readPartition: () => Promise.resolve(entries.map(path => ({ path })))
  }
}

describe('sitemap particionado', () => {
  it('divide páginas estáticas por bytes e mantém urlset pequeno', async () => {
    const small = await buildSitemapIndexResponse({
      manifest,
      sources: [],
      siteUrl,
      signal,
      matchRoute
    })
    await expect(small.text()).resolves.toContain('<urlset')
    const large = await buildSitemapIndexResponse({
      manifest: {
        ...manifest,
        entries: [
          { path: `/${'a'.repeat(LONG_PATH_CHARS)}` },
          { path: `/${'b'.repeat(LONG_PATH_CHARS)}` }
        ]
      },
      sources: [],
      siteUrl,
      signal,
      matchRoute,
      byteBudget: 20_000
    })
    await expect(large.text()).resolves.toContain('<sitemapindex')
  })

  it('aceita o orçamento exato de bytes e recusa um grupo uma unidade acima', async () => {
    const entries = [{ path: '/blog/static' }]
    const exact = new TextEncoder().encode(
      buildSitemap({ entries, siteUrl })
    ).byteLength
    const accepted = await buildSitemapIndexResponse({
      manifest,
      sources: [],
      siteUrl,
      signal,
      matchRoute,
      byteBudget: exact
    })
    expect(accepted.status).toBe(HTTP_OK)
    const rejected = await buildSitemapIndexResponse({
      manifest,
      sources: [],
      siteUrl,
      signal,
      matchRoute,
      byteBudget: exact - 1
    })
    expect(rejected.status).toBe(HTTP_SERVICE_UNAVAILABLE)
  })

  it(
    'mantém o count exato em um urlset e divide uma entrada acima',
    { timeout: 30_000 },
    async () => {
      const count = Math.floor(SITEMAP_URL_LIMIT / locales.length)
      const entries = Array.from({ length: count }, (_, index) => ({
        path: `/page-${index}`
      }))
      const atLimit = await buildSitemapIndexResponse({
        manifest: { ...manifest, entries },
        sources: [],
        siteUrl,
        signal,
        matchRoute,
        byteBudget: SITEMAP_BYTE_LIMIT
      })
      expect(atLimit.status).toBe(HTTP_OK)
      await expect(atLimit.text()).resolves.toContain('<urlset')
      const above = await buildSitemapIndexResponse({
        manifest: { ...manifest, entries: [...entries, { path: '/extra' }] },
        sources: [],
        siteUrl,
        signal,
        matchRoute,
        byteBudget: SITEMAP_BYTE_LIMIT
      })
      expect(above.status).toBe(HTTP_OK)
      await expect(above.text()).resolves.toContain('<sitemapindex')
    }
  )

  it('consulta somente a partição pedida', async () => {
    const selected = {
      ...source(['/blog/first']),
      listPartitions: vi.fn<() => Promise<string[]>>(() =>
        Promise.reject(new Error('Não deve enumerar partições'))
      )
    }
    const other = {
      ...source(['/stories/second']),
      id: 'stories',
      routePath: '/stories/*rest',
      listPartitions: vi.fn<() => Promise<string[]>>(() =>
        Promise.reject(new Error('Não deve consultar outra fonte'))
      ),
      readPartition: vi.fn<SitemapPartitionSource['readPartition']>(() =>
        Promise.resolve([{ path: '/stories/second' }])
      )
    }
    const response = await buildSitemapPartResponse({
      manifest,
      sources: [selected, other],
      siteUrl,
      signal,
      matchRoute,
      kind: 'source',
      source: 'blog',
      part: 'first'
    })
    expect(response.status).toBe(HTTP_OK)
    await expect(response.text()).resolves.toContain('/blog/first')
    expect(other.readPartition).not.toHaveBeenCalled()
    expect(selected.listPartitions).not.toHaveBeenCalled()
    expect(other.listPartitions).not.toHaveBeenCalled()
  })

  it('não acessa o inventário estático ao servir uma parte dinâmica', async () => {
    const isolated = {
      ...manifest,
      get entries(): typeof manifest.entries {
        throw new Error('Inventário estático não deve ser lido')
      }
    }
    const response = await buildSitemapPartResponse({
      manifest: isolated,
      sources: [source(['/blog/first'])],
      siteUrl,
      signal,
      matchRoute,
      kind: 'source',
      source: 'blog',
      part: 'first'
    })
    expect(response.status).toBe(HTTP_OK)
  })
})

describe('validação das fontes e consistência eventual', () => {
  it('recusa página estática que sombreia a rota dinâmica', async () => {
    const response = await buildSitemapPartResponse({
      manifest,
      sources: [source(['/blog/static'])],
      siteUrl,
      signal,
      matchRoute,
      kind: 'source',
      source: 'blog',
      part: 'first'
    })
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('aceita splat efetivo e recusa fonte sob noindex herdado', async () => {
    const stories = {
      ...source(['/stories/a/b']),
      id: 'stories',
      routePath: '/stories/*rest'
    }
    const accepted = await buildSitemapPartResponse({
      manifest,
      sources: [stories],
      siteUrl,
      signal,
      matchRoute,
      kind: 'source',
      source: 'stories',
      part: 'first'
    })
    expect(accepted.status).toBe(HTTP_OK)
    const rejected = await buildSitemapIndexResponse({
      manifest: {
        ...manifest,
        dynamicRoutes: [{ path: '/stories/*rest', isIndexable: false }]
      },
      sources: [stories],
      siteUrl,
      signal,
      matchRoute
    })
    expect(rejected.status).toBe(HTTP_SERVICE_UNAVAILABLE)
  })

  it('responde 404 sem cache para partição removida ou vazia', async () => {
    const removed = await buildSitemapPartResponse({
      manifest,
      sources: [source([])],
      siteUrl,
      signal,
      matchRoute,
      kind: 'source',
      source: 'blog',
      part: 'removed'
    })
    expect(removed.status).toBe(HTTP_NOT_FOUND)
    expect(removed.headers.get('cache-control')).toBe('no-store')
  })

  it('índice antigo pode apontar para parte removida após atualização', async () => {
    let isPresent = true
    const changing = {
      ...source([]),
      readPartition: () =>
        Promise.resolve(isPresent ? [{ path: '/blog/first' }] : [])
    }
    const index = await buildSitemapIndexResponse({
      manifest,
      sources: [changing],
      siteUrl,
      signal,
      matchRoute
    })
    await expect(index.text()).resolves.toContain('/sitemaps/blog/first.xml')
    isPresent = false
    const removed = await buildSitemapPartResponse({
      manifest,
      sources: [changing],
      siteUrl,
      signal,
      matchRoute,
      kind: 'source',
      source: 'blog',
      part: 'first'
    })
    expect(removed.status).toBe(HTTP_NOT_FOUND)
    expect(removed.headers.get('cache-control')).toBe('no-store')
  })

  it('publica inserção, migração entre partes e rollback eventual', async () => {
    let activePart = 'a'
    const changing = {
      ...source([]),
      listPartitions: () => Promise.resolve([activePart]),
      readPartition: ({ id }: SitemapPartitionReadOptions) =>
        Promise.resolve(id === activePart ? [{ path: '/blog/post' }] : [])
    }
    const options = {
      manifest,
      sources: [changing],
      siteUrl,
      signal,
      matchRoute
    }
    const initial = await buildSitemapIndexResponse(options)
    await expect(initial.text()).resolves.toContain('/sitemaps/blog/a.xml')
    activePart = 'b'
    const updated = await buildSitemapIndexResponse(options)
    await expect(updated.text()).resolves.toContain('/sitemaps/blog/b.xml')
    const oldPart = await buildSitemapPartResponse({
      ...options,
      kind: 'source',
      source: 'blog',
      part: 'a'
    })
    expect(oldPart.status).toBe(HTTP_NOT_FOUND)
    const newPart = await buildSitemapPartResponse({
      ...options,
      kind: 'source',
      source: 'blog',
      part: 'b'
    })
    expect(newPart.status).toBe(HTTP_OK)
    activePart = 'a'
    const rollback = await buildSitemapPartResponse({
      ...options,
      kind: 'source',
      source: 'blog',
      part: 'a'
    })
    expect(rollback.status).toBe(HTTP_OK)
  })

  it('cancela a espera quando a fonte ignora o sinal', async () => {
    vi.useFakeTimers()
    try {
      const blocked = {
        ...source([]),
        readPartition: () =>
          Promise.withResolvers<readonly { path: string }[]>().promise
      }
      const pending = buildSitemapPartResponse({
        manifest,
        sources: [blocked],
        siteUrl,
        signal,
        matchRoute,
        kind: 'source',
        source: 'blog',
        part: 'first'
      })
      await vi.advanceTimersByTimeAsync(SITEMAP_SOURCES_TIMEOUT_MS)
      const response = await pending
      expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    } finally {
      vi.useRealTimers()
    }
  })
})
