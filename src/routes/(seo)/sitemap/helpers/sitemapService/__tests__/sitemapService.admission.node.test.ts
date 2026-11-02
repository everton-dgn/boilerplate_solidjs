import type {
  SitemapEntry,
  SitemapPartitionSource,
  SitemapRouteInfo
} from '@/@types/sitemap.ts'
import {
  HTTP_NOT_FOUND,
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE
} from '@/constants/http.ts'
import type {
  PublicationLimits,
  PublicationOptions
} from '@/infra/server/publication/types.ts'

import {
  SITEMAP_LOC_LIMIT,
  SITEMAP_SOURCES_TIMEOUT_MS,
  SITEMAP_URL_LIMIT
} from '../../../constants.ts'
import { matchSitemapRoute } from '../../matchSitemapRoute/index.ts'
import {
  buildSitemapIndexResponse,
  buildSitemapPartResponse
} from '../index.ts'

type Run = (options: PublicationOptions) => Promise<Response>
type ControllerState = { run?: Run }

const publication = vi.hoisted(() => {
  const state: ControllerState = {}
  return state
})

vi.mock(import('@/infra/server/publication/index.ts'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    runPublication: (options: PublicationOptions) => {
      if (!publication.run) throw new Error('Controlador ausente')
      return publication.run(options)
    }
  }
})

const { createPublicationController } =
  await import('@/infra/server/publication/index.ts')

type Controller = ReturnType<typeof createPublicationController>

const siteUrl = 'https://example.com'
const { signal } = new AbortController()
const matchRoute = matchSitemapRoute([
  { path: '/blog/:slug', page: true },
  { path: '/story/:slug', page: true },
  { path: '/about', page: true }
])
const manifest = {
  entries: [{ path: '/about' }],
  sources: [],
  dynamicRoutes: [
    { path: '/blog/:slug', isIndexable: true },
    { path: '/story/:slug', isIndexable: true }
  ]
}
const sourceOptions = { manifest, siteUrl, signal, matchRoute }
const partOptions = {
  ...sourceOptions,
  kind: 'source' as const,
  source: 'blog',
  part: 'a'
}

function useController(limits: Partial<PublicationLimits> = {}): Controller {
  const controller = createPublicationController({
    total: 2,
    sitemap: 2,
    markdown: 2,
    sources: 4,
    perSource: 4,
    outputs: 2,
    reservedBytes: 16_777_216,
    ...limits
  })
  publication.run = controller.runPublication
  return controller
}

function source(
  overrides: Partial<SitemapPartitionSource> = {}
): SitemapPartitionSource {
  return {
    id: 'blog',
    routePath: '/blog/:slug',
    listPartitions: () => Promise.resolve(['a']),
    readPartition: () => Promise.resolve([{ path: '/blog/a' }]),
    ...overrides
  }
}

function legacyManifest(sources: SitemapRouteInfo[]) {
  return {
    ...manifest,
    sources,
    sourceRoutes: sources.map(() => '/blog/:slug')
  }
}

function prepare(): void {
  vi.stubEnv('DEV', false)
  vi.spyOn(console, 'error').mockReturnValue()
}

function restore(): void {
  vi.useRealTimers()
  vi.restoreAllMocks()
}

describe('admissão do sitemap', () => {
  beforeEach(prepare)
  afterEach(restore)

  it('recusa o pedido extra sem iniciar o produtor, com resposta pequena', async () => {
    const controller = useController({ total: 1, sitemap: 1, outputs: 1 })
    const gate = Promise.withResolvers<SitemapEntry[]>()
    const readPartition = vi.fn<SitemapPartitionSource['readPartition']>(
      () => gate.promise
    )
    const selected = source({ readPartition })
    const first = buildSitemapPartResponse({
      ...partOptions,
      sources: [selected]
    })
    await vi.waitFor(() => expect(readPartition).toHaveBeenCalledOnce())
    const refused = await buildSitemapPartResponse({
      ...partOptions,
      sources: [selected],
      part: 'b'
    })
    expect({
      status: refused.status,
      cacheControl: refused.headers.get('cache-control'),
      retryAfter: refused.headers.get('retry-after')
    }).toStrictEqual({
      status: HTTP_SERVICE_UNAVAILABLE,
      cacheControl: 'no-store',
      retryAfter: '1'
    })
    expect(readPartition).toHaveBeenCalledOnce()
    expect(console.error).not.toHaveBeenCalled()
    gate.resolve([{ path: '/blog/a' }])
    const admitted = await first
    await expect(admitted.text()).resolves.toContain('/blog/a')
    expect(controller.getMetrics().active).toBe(0)
  })

  it('mantém a vaga depois do prazo enquanto a fonte ignora o sinal', async () => {
    vi.useFakeTimers()
    const controller = useController({ total: 1, sitemap: 1, outputs: 2 })
    const late = Promise.withResolvers<SitemapEntry[]>()
    const blocked = source({ readPartition: () => late.promise })
    const pending = buildSitemapPartResponse({
      ...partOptions,
      sources: [blocked]
    })
    await vi.advanceTimersByTimeAsync(SITEMAP_SOURCES_TIMEOUT_MS)
    const timedOut = await pending
    expect({
      status: timedOut.status,
      retryAfter: timedOut.headers.get('retry-after')
    }).toStrictEqual({ status: HTTP_SERVICE_UNAVAILABLE, retryAfter: null })
    expect(controller.getMetrics()).toMatchObject({ active: 1, sources: 1 })
    const readNext = vi.fn<SitemapPartitionSource['readPartition']>()
    const refused = await buildSitemapPartResponse({
      ...partOptions,
      sources: [source({ readPartition: readNext })]
    })
    expect(refused.headers.get('retry-after')).toBe('1')
    expect(readNext).not.toHaveBeenCalled()
    late.resolve([{ path: '/blog/late' }])
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.getMetrics()).toMatchObject({ active: 0, sources: 0 })
  })

  it('libera a vaga uma vez em rejeição tardia e em exceção síncrona', async () => {
    vi.useFakeTimers()
    const controller = useController({ total: 1, sitemap: 1, outputs: 2 })
    const late = Promise.withResolvers<SitemapEntry[]>()
    const pending = buildSitemapPartResponse({
      ...partOptions,
      sources: [source({ readPartition: () => late.promise })]
    })
    await vi.advanceTimersByTimeAsync(SITEMAP_SOURCES_TIMEOUT_MS)
    await pending
    late.reject(new Error('Tardia'))
    await vi.advanceTimersByTimeAsync(0)
    const thrown = await buildSitemapPartResponse({
      ...partOptions,
      sources: [
        source({
          readPartition: () => {
            throw new Error('Síncrona')
          }
        })
      ]
    })
    expect(thrown.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    expect(controller.getMetrics()).toMatchObject({ active: 0, sources: 0 })
  })

  it('não inicia o legado seguinte depois de uma falha e funciona com capacidade 1', async () => {
    const controller = useController({
      total: 1,
      sitemap: 1,
      outputs: 1,
      sources: 1,
      perSource: 1
    })
    const next = vi.fn<() => SitemapEntry[]>(() => [])
    const response = await buildSitemapIndexResponse({
      ...sourceOptions,
      manifest: legacyManifest([
        () => {
          throw new Error('Falha')
        },
        next
      ]),
      sources: []
    })
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    expect(next).not.toHaveBeenCalled()
    expect(controller.getMetrics()).toMatchObject({ active: 0, sources: 0 })
    const healthy = await buildSitemapIndexResponse({
      ...sourceOptions,
      manifest: legacyManifest([() => [{ path: '/blog/a' }]]),
      sources: []
    })
    expect(healthy.status).toBe(HTTP_OK)
    await healthy.text()
  })

  it('executa fontes legadas uma por vez', async () => {
    const controller = useController()
    const first = Promise.withResolvers<SitemapEntry[]>()
    const second = vi.fn<() => SitemapEntry[]>(() => [{ path: '/blog/b' }])
    const pending = buildSitemapPartResponse({
      ...sourceOptions,
      manifest: legacyManifest([() => first.promise, second]),
      sources: [],
      kind: 'legacy',
      part: 'legacy'
    })
    await vi.waitFor(() => expect(controller.getMetrics().sources).toBe(1))
    expect(second).not.toHaveBeenCalled()
    first.resolve([{ path: '/blog/a' }])
    const response = await pending
    expect(response.status).toBe(HTTP_OK)
    expect(second).toHaveBeenCalledOnce()
    await response.text()
  })

  it('índice e parte disputam o executor da fonte sem esperar nem índice parcial', async () => {
    const controller = useController({ sources: 1, perSource: 1 })
    const gate = Promise.withResolvers<string[]>()
    const selected = source({ listPartitions: () => gate.promise })
    const index = buildSitemapIndexResponse({
      ...sourceOptions,
      sources: [selected]
    })
    await vi.waitFor(() => expect(controller.getMetrics().sources).toBe(1))
    const refused = await buildSitemapPartResponse({
      ...partOptions,
      sources: [selected]
    })
    expect(refused.headers.get('retry-after')).toBe('1')
    expect(controller.getMetrics().rejected).toBe(1)
    gate.resolve(['a'])
    const response = await index
    await expect(response.text()).resolves.toContain('/sitemaps/blog/a.xml')
    expect(controller.getMetrics()).toMatchObject({ active: 0, sources: 0 })
  })
})

describe('limites antes da fonte', () => {
  beforeEach(prepare)
  afterEach(restore)

  it('aborta o sinal da fonte ao fim da leitura, sem cortar a resposta', async () => {
    useController()
    const received = Promise.withResolvers<AbortSignal>()
    const response = await buildSitemapPartResponse({
      ...partOptions,
      sources: [
        source({
          readPartition: ({ signal: sourceSignal }) => {
            received.resolve(sourceSignal)
            return Promise.resolve([{ path: '/blog/a' }])
          }
        })
      ]
    })
    await expect(response.text()).resolves.toContain('/blog/a')
    await expect(received.promise).resolves.toHaveProperty('aborted', true)
  })

  it('informa o orçamento à enumeração e recusa acima dele antes de normalizar', async () => {
    useController()
    const listPartitions = vi.fn<SitemapPartitionSource['listPartitions']>(() =>
      Promise.resolve(['a'])
    )
    const response = await buildSitemapIndexResponse({
      ...sourceOptions,
      sources: [source({ listPartitions })]
    })
    await response.text()
    expect(listPartitions.mock.calls[0]?.[0].limit).toBe(SITEMAP_URL_LIMIT)
  })

  it.each([
    { part: 'BAD' },
    { part: 'a/b' },
    { part: 'x'.repeat(SITEMAP_LOC_LIMIT + 1) }
  ])('recusa ID inválido antes da admissão e da fonte', async ({ part }) => {
    const controller = useController({ total: 1, sitemap: 1, outputs: 1 })
    const readPartition = vi.fn<SitemapPartitionSource['readPartition']>()
    const response = await buildSitemapPartResponse({
      ...partOptions,
      part,
      sources: [source({ readPartition })]
    })
    expect(response.status).toBe(HTTP_NOT_FOUND)
    expect(readPartition).not.toHaveBeenCalled()
    expect(controller.getMetrics().rejected).toBe(0)
  })

  it('não consome vaga para responder 404 sem fonte registrada', async () => {
    const controller = useController({ total: 1, sitemap: 1, outputs: 1 })
    const gate = Promise.withResolvers<SitemapEntry[]>()
    const pending = buildSitemapPartResponse({
      ...partOptions,
      sources: [source({ readPartition: () => gate.promise })]
    })
    await vi.waitFor(() => expect(controller.getMetrics().active).toBe(1))
    for (const options of [
      { ...partOptions, sources: [], source: 'absent' },
      { ...partOptions, sources: [], kind: 'legacy' as const }
    ]) {
      const response = await buildSitemapPartResponse(options)
      expect(response.status).toBe(HTTP_NOT_FOUND)
    }
    expect(controller.getMetrics().rejected).toBe(0)
    gate.resolve([{ path: '/blog/a' }])
    const admitted = await pending
    await admitted.text()
  })
})

describe('sitemap expected cancellation', () => {
  it('responds without logging an already canceled request', async () => {
    const controller = useController()
    const client = new AbortController()
    client.abort()
    const log = vi.spyOn(console, 'error').mockReturnValue()
    const response = await buildSitemapIndexResponse({
      ...sourceOptions,
      signal: client.signal,
      sources: []
    })
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    expect(log).not.toHaveBeenCalled()
    expect(controller.getMetrics()).toMatchObject({
      active: 0,
      aborted: 1,
      timedOut: 0
    })
  })
})
