import type { SitemapEntry, SitemapPartitionSource } from '@/@types/sitemap.ts'
import {
  HTTP_NOT_FOUND,
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE
} from '@/constants/http.ts'
import type { PublicationOptions } from '@/infra/server/publication/types.ts'

import {
  SITEMAP_LOC_LIMIT,
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
const matchRoute = matchSitemapRoute([
  { path: '/blog/:slug', page: true },
  { path: '/blog/static', page: true }
])
const manifest = {
  entries: [{ path: '/blog/static' }],
  sources: [],
  dynamicRoutes: [{ path: '/blog/:slug', isIndexable: true }]
}
const LONG_PATH_LENGTH = 2048
const INVALID_PATH_VALUE = 42

function source(): SitemapPartitionSource {
  return {
    id: 'blog',
    routePath: '/blog/:slug',
    listPartitions: () => Promise.resolve(['a']),
    readPartition: () => Promise.resolve([{ path: '/blog/a' }])
  }
}

describe('registry and limit validation', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockReturnValue()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('applies the byte limit regardless of the record limit of the source', async () => {
    const entries = [{ path: '/blog/a' }]
    const xml = buildSitemap({ entries, siteUrl })
    const bytes = new TextEncoder().encode(xml).byteLength
    const readPartition = vi.fn<SitemapPartitionSource['readPartition']>(() =>
      Promise.resolve(entries)
    )
    const options = {
      manifest,
      sources: [{ ...source(), readPartition }],
      siteUrl,
      signal,
      matchRoute,
      kind: 'source' as const,
      source: 'blog',
      part: 'a'
    }
    const exact = await buildSitemapPartResponse({
      ...options,
      byteBudget: bytes
    })
    expect({ status: exact.status, body: await exact.text() }).toStrictEqual({
      status: HTTP_OK,
      body: xml
    })
    const exceeded = await buildSitemapPartResponse({
      ...options,
      byteBudget: bytes - 1
    })
    expect({
      status: exceeded.status,
      cacheControl: exceeded.headers.get('cache-control'),
      body: await exceeded.text()
    }).toStrictEqual({
      status: HTTP_SERVICE_UNAVAILABLE,
      cacheControl: 'no-store',
      body: ''
    })
    expect(readPartition).toHaveBeenCalledTimes([bytes, bytes - 1].length)
    for (const [readOptions] of readPartition.mock.calls) {
      expect(readOptions.limit).toBeGreaterThan(entries.length)
    }
  })

  it.each([
    { id: 'bad/segment', routePath: '/blog/:slug' },
    { id: 'pages', routePath: '/blog/:slug' },
    { id: 'array', routePath: '/blog/:slug' },
    { id: 'blog', routePath: '/absent/:slug' }
  ])('refuses the invalid registry $id', async invalid => {
    const response = await buildSitemapIndexResponse({
      manifest,
      sources: [{ ...source(), ...invalid }],
      siteUrl,
      signal,
      matchRoute
    })
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('refuses duplicated IDs and two sources of the same route', async () => {
    const duplicate = await buildSitemapIndexResponse({
      manifest,
      sources: [source(), source()],
      siteUrl,
      signal,
      matchRoute
    })
    expect(duplicate.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    const sameRoute = await buildSitemapIndexResponse({
      manifest,
      sources: [source(), { ...source(), id: 'other' }],
      siteUrl,
      signal,
      matchRoute
    })
    expect(sameRoute.status).toBe(HTTP_SERVICE_UNAVAILABLE)
  })

  it('refuses a partitioned source on the same route as an array source', async () => {
    const response = await buildSitemapIndexResponse({
      manifest: { ...manifest, sourceRoutes: ['/blog/:slug'] },
      sources: [source()],
      siteUrl,
      signal,
      matchRoute
    })
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
  })

  it('refuses duplicated and reserved partitions and an oversized index', async () => {
    for (const ids of [
      ['a', 'a'],
      ['bad/id'],
      Array.from({ length: SITEMAP_URL_LIMIT + 1 }, (_, index) => `p-${index}`)
    ]) {
      const response = await buildSitemapIndexResponse({
        manifest,
        sources: [{ ...source(), listPartitions: () => Promise.resolve(ids) }],
        siteUrl,
        signal,
        matchRoute
      })
      expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    }
  })

  it('refuses a duplicate by the localized URL, an invalid schema and a long loc', async () => {
    const malformed: SitemapEntry = { path: '/blog/a' }
    Reflect.set(malformed, 'path', INVALID_PATH_VALUE)
    const cases: readonly SitemapEntry[][] = [
      [{ path: '/blog/a' }, { path: '/pt/blog/a' }],
      [malformed],
      [{ path: `/blog/${'x'.repeat(LONG_PATH_LENGTH)}` }]
    ]
    for (const entries of cases) {
      const selected = {
        ...source(),
        readPartition: () => Promise.resolve(entries)
      }
      const response = await buildSitemapPartResponse({
        manifest,
        sources: [selected],
        siteUrl,
        signal,
        matchRoute,
        kind: 'source',
        source: 'blog',
        part: 'a'
      })
      expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    }
  })

  it('accepts a loc at the limit and refuses one character above, in the index too', async () => {
    const base = `${siteUrl}/pt/blog/`
    const exactPath = `/blog/${'x'.repeat(SITEMAP_LOC_LIMIT - base.length)}`
    const accepted = await buildSitemapPartResponse({
      manifest,
      sources: [
        {
          ...source(),
          readPartition: () => Promise.resolve([{ path: exactPath }])
        }
      ],
      siteUrl,
      signal,
      matchRoute,
      kind: 'source',
      source: 'blog',
      part: 'a'
    })
    expect(accepted.status).toBe(HTTP_OK)
    const above = await buildSitemapPartResponse({
      manifest,
      sources: [
        {
          ...source(),
          readPartition: () => Promise.resolve([{ path: `${exactPath}x` }])
        }
      ],
      siteUrl,
      signal,
      matchRoute,
      kind: 'source',
      source: 'blog',
      part: 'a'
    })
    expect(above.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    const indexBase = `${siteUrl}/sitemaps/blog/.xml`
    const exactId = 'x'.repeat(SITEMAP_LOC_LIMIT - indexBase.length)
    const exactIndex = await buildSitemapIndexResponse({
      manifest,
      sources: [
        { ...source(), listPartitions: () => Promise.resolve([exactId]) }
      ],
      siteUrl,
      signal,
      matchRoute
    })
    expect(exactIndex.status).toBe(HTTP_OK)
    const aboveIndex = await buildSitemapIndexResponse({
      manifest,
      sources: [
        { ...source(), listPartitions: () => Promise.resolve([`${exactId}x`]) }
      ],
      siteUrl,
      signal,
      matchRoute
    })
    expect(aboveIndex.status).toBe(HTTP_SERVICE_UNAVAILABLE)
  })
})

describe('source compatibility and lifecycle', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockReturnValue()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps the first entry of the array source and rejects a wrong route', async () => {
    const routeManifest = {
      ...manifest,
      sources: [() => [{ path: '/blog/a' }, { path: '/pt/blog/a' }]],
      sourceRoutes: ['/blog/:slug']
    }
    const response = await buildSitemapIndexResponse({
      manifest: routeManifest,
      sources: [],
      siteUrl,
      signal,
      matchRoute
    })
    expect(response.status).toBe(HTTP_OK)
    const xml = await response.text()
    expect(
      xml.match(/<loc>https:\/\/example.com\/pt\/blog\/a<\/loc>/gu)
    ).toHaveLength(1)
    const wrong = await buildSitemapIndexResponse({
      manifest: { ...routeManifest, sources: [() => [{ path: '/other' }]] },
      sources: [],
      siteUrl,
      signal,
      matchRoute
    })
    expect(wrong.status).toBe(HTTP_SERVICE_UNAVAILABLE)
  })

  it('head keeps the status and the headers without a body; an empty part is 404', async () => {
    const options = {
      manifest,
      sources: [source()],
      siteUrl,
      signal,
      matchRoute,
      kind: 'source' as const,
      source: 'blog',
      part: 'a'
    }
    const get = await buildSitemapPartResponse(options)
    const head = await buildSitemapPartResponse({ ...options, method: 'HEAD' })
    expect(get.status).toBe(HTTP_OK)
    expect(head.status).toBe(get.status)
    expect(head.headers.get('content-length')).toBe(
      get.headers.get('content-length')
    )
    await expect(head.text()).resolves.toBe('')
    const empty = await buildSitemapPartResponse({
      ...options,
      sources: [{ ...source(), readPartition: () => Promise.resolve([]) }]
    })
    expect(empty.status).toBe(HTTP_NOT_FOUND)
  })

  it('does not start a source when the signal was already aborted', async () => {
    const readPartition = vi.fn<SitemapPartitionSource['readPartition']>(() =>
      Promise.resolve([])
    )
    const response = await buildSitemapPartResponse({
      manifest,
      sources: [{ ...source(), readPartition }],
      siteUrl,
      signal: AbortSignal.abort(),
      matchRoute,
      kind: 'source',
      source: 'blog',
      part: 'a'
    })
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    expect(readPartition).not.toHaveBeenCalled()
  })

  it('compiles the registry once per immutable context', async () => {
    let reads = 0
    const context = {
      ...manifest,
      get dynamicRoutes() {
        reads += 1
        return manifest.dynamicRoutes
      }
    }
    const sources = [source()]
    const options = {
      manifest: context,
      sources,
      siteUrl,
      signal,
      matchRoute,
      kind: 'source' as const,
      source: 'blog',
      part: 'a'
    }
    const first = await buildSitemapPartResponse(options)
    const second = await buildSitemapPartResponse(options)
    expect(first.status).toBe(HTTP_OK)
    expect(second.status).toBe(HTTP_OK)
    expect(reads).toBe(1)
  })
})

describe('source deadline and cancellation', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockReturnValue()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shares the deadline between the array read and the partition list', async () => {
    vi.useFakeTimers()
    const arrayRead = Promise.withResolvers<SitemapEntry[]>()
    const partitions = Promise.withResolvers<string[]>()
    const listPartitions = vi.fn<() => Promise<string[]>>(
      () => partitions.promise
    )
    const pending = buildSitemapIndexResponse({
      manifest: {
        ...manifest,
        sources: [() => arrayRead.promise],
        sourceRoutes: ['/blog/:slug'],
        dynamicRoutes: [
          ...manifest.dynamicRoutes,
          { path: '/story/:slug', isIndexable: true }
        ]
      },
      sources: [
        {
          ...source(),
          id: 'stories',
          routePath: '/story/:slug',
          listPartitions
        }
      ],
      siteUrl,
      signal,
      matchRoute
    })
    const arrayDuration = SITEMAP_SOURCES_TIMEOUT_MS - 1
    await vi.advanceTimersByTimeAsync(arrayDuration)
    arrayRead.resolve([{ path: '/blog/a' }])
    await vi.advanceTimersByTimeAsync(0)
    expect(listPartitions).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    const response = await pending
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    partitions.reject(new Error('Rejection after the shared deadline'))
    await vi.advanceTimersByTimeAsync(0)
  })

  it('ends the wait on disconnection and aborts the forwarded signal', async () => {
    const request = new AbortController()
    const received = Promise.withResolvers<AbortSignal>()
    const selected = {
      ...source(),
      readPartition: ({
        signal: sourceSignal
      }: SitemapPartitionReadOptions) => {
        received.resolve(sourceSignal)
        return Promise.withResolvers<SitemapEntry[]>().promise
      }
    }
    const pending = buildSitemapPartResponse({
      manifest,
      sources: [selected],
      siteUrl,
      signal: request.signal,
      matchRoute,
      kind: 'source',
      source: 'blog',
      part: 'a'
    })
    const sourceSignal = await received.promise
    request.abort()
    const response = await pending
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    expect(sourceSignal.aborted).toBe(true)
  })

  it('absorbs a late rejection and a sync exception without leaving a loose promise', async () => {
    vi.useFakeTimers()
    const work = Promise.withResolvers<SitemapEntry[]>()
    const selected = { ...source(), readPartition: () => work.promise }
    const pending = buildSitemapPartResponse({
      manifest,
      sources: [selected],
      siteUrl,
      signal,
      matchRoute,
      kind: 'source',
      source: 'blog',
      part: 'a'
    })
    await vi.advanceTimersByTimeAsync(SITEMAP_SOURCES_TIMEOUT_MS)
    const timedOut = await pending
    expect(timedOut.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    work.reject(new Error('Late'))
    await vi.advanceTimersByTimeAsync(0)
    const thrown = {
      ...source(),
      listPartitions: () => {
        throw new Error('Synchronous')
      }
    }
    const response = await buildSitemapIndexResponse({
      manifest,
      sources: [thrown],
      siteUrl,
      signal,
      matchRoute
    })
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
  })

  it('uses a total deadline for several sources and does not call the next one after an abort', async () => {
    vi.useFakeTimers()
    const next = vi.fn<() => Promise<string[]>>(() => Promise.resolve(['b']))
    const first = {
      ...source(),
      listPartitions: () => Promise.withResolvers<string[]>().promise
    }
    const extendedManifest = {
      ...manifest,
      dynamicRoutes: [
        ...manifest.dynamicRoutes,
        { path: '/story/:slug', isIndexable: true }
      ]
    }
    const pending = buildSitemapIndexResponse({
      manifest: extendedManifest,
      sources: [
        first,
        {
          ...source(),
          id: 'other',
          routePath: '/story/:slug',
          listPartitions: next
        }
      ],
      siteUrl,
      signal,
      matchRoute
    })
    await vi.advanceTimersByTimeAsync(SITEMAP_SOURCES_TIMEOUT_MS)
    const response = await pending
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    expect(next).not.toHaveBeenCalled()
  })
})
