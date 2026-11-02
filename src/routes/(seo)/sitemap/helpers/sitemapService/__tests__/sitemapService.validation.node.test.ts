import type { SitemapEntry, SitemapPartitionSource } from '@/@types/sitemap.ts'
import {
  HTTP_NOT_FOUND,
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE
} from '@/constants/http.ts'

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

describe('validação do registro e dos limites', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockReturnValue()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('aplica o teto de bytes independentemente do limite de registros da fonte', async () => {
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
    { id: 'legacy', routePath: '/blog/:slug' },
    { id: 'blog', routePath: '/absent/:slug' }
  ])('recusa registro inválido $id', async invalid => {
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

  it('recusa IDs duplicados e duas fontes da mesma rota', async () => {
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

  it('recusa fonte particionada na mesma rota legada', async () => {
    const response = await buildSitemapIndexResponse({
      manifest: { ...manifest, sourceRoutes: ['/blog/:slug'] },
      sources: [source()],
      siteUrl,
      signal,
      matchRoute
    })
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
  })

  it('recusa partições duplicadas, reservadas e índice excessivo', async () => {
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

  it('recusa duplicata pela URL localizada, schema inválido e loc longo', async () => {
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

  it('aceita loc no limite e recusa um caractere acima, inclusive no índice', async () => {
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

describe('compatibilidade e ciclo de vida das fontes', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockReturnValue()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('preserva a primeira entrada da fonte legada e rejeita rota errada', async () => {
    const legacy = {
      ...manifest,
      sources: [() => [{ path: '/blog/a' }, { path: '/pt/blog/a' }]],
      sourceRoutes: ['/blog/:slug']
    }
    const response = await buildSitemapIndexResponse({
      manifest: legacy,
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
      manifest: { ...legacy, sources: [() => [{ path: '/other' }]] },
      sources: [],
      siteUrl,
      signal,
      matchRoute
    })
    expect(wrong.status).toBe(HTTP_SERVICE_UNAVAILABLE)
  })

  it('head preserva status e cabeçalhos sem corpo; parte vazia é 404', async () => {
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

  it('não inicia fonte quando sinal já foi abortado', async () => {
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

  it('compila o registro uma vez por contexto imutável', async () => {
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

describe('prazo e cancelamento das fontes', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockReturnValue()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('compartilha o prazo entre leitura legada e lista de partições', async () => {
    vi.useFakeTimers()
    const legacy = Promise.withResolvers<SitemapEntry[]>()
    const partitions = Promise.withResolvers<string[]>()
    const listPartitions = vi.fn<() => Promise<string[]>>(
      () => partitions.promise
    )
    const pending = buildSitemapIndexResponse({
      manifest: {
        ...manifest,
        sources: [() => legacy.promise],
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
    const legacyDuration = SITEMAP_SOURCES_TIMEOUT_MS - 1
    await vi.advanceTimersByTimeAsync(legacyDuration)
    legacy.resolve([{ path: '/blog/a' }])
    await vi.advanceTimersByTimeAsync(0)
    expect(listPartitions).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    const response = await pending
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    partitions.reject(new Error('Rejeição depois do prazo compartilhado'))
    await vi.advanceTimersByTimeAsync(0)
  })

  it('encerra a espera na desconexão e aborta o sinal repassado', async () => {
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

  it('absorve rejeição tardia e exceção síncrona sem deixar promise solta', async () => {
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
    work.reject(new Error('Tardia'))
    await vi.advanceTimersByTimeAsync(0)
    const thrown = {
      ...source(),
      listPartitions: () => {
        throw new Error('Síncrona')
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

  it('usa prazo total para várias fontes e não chama a seguinte após abort', async () => {
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
