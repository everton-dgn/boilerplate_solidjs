import { locales } from '@paraglide/runtime.js'

import type { SitemapEntry, SitemapRouteInfo } from '@/@types/sitemap.ts'
import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'
import { readLog } from '@/tests/helpers/readLog/index.ts'

import {
  SITEMAP_SOURCES_TIMEOUT_MS,
  SITEMAP_URL_LIMIT
} from '../../../constants.ts'
import type { SitemapManifest } from '../../../types.ts'
import { buildSitemap } from '../../buildSitemap/index.ts'
import { buildSitemapResponse } from '../index.ts'

const SITE_URL = 'https://example.com'
const HTTP_OK = 200
const HTTP_SERVICE_UNAVAILABLE = 503
const SITEMAP_BYTE_LIMIT = 52_428_800
const LARGE_SITEMAP_TIMEOUT_MS = 30_000
const BASE_PATH_LENGTH = 100
const BASE_ENTRY_COUNT = 4000
const URL_COPIES = 15
const SITEMAP_LOG = '[sitemap] Unexpected failure; private details omitted'
// Maior quantidade de entradas cujas URLs localizadas cabem no limite.
const ENTRIES_AT_URL_LIMIT = Math.floor(SITEMAP_URL_LIMIT / locales.length)

function baseEntries(): SitemapEntry[] {
  return Array.from({ length: BASE_ENTRY_COUNT }, (_, index) => ({
    path: `/page-${index}-${'a'.repeat(BASE_PATH_LENGTH)}`
  }))
}

function sitemapBytes(entries: SitemapEntry[]): number {
  return new TextEncoder().encode(buildSitemap({ entries, siteUrl: SITE_URL }))
    .byteLength
}

// Os caminhos são ASCII, então cada byte do XML vem da moldura, do custo fixo
// de uma URL ou de um caractere do caminho. Montar o XML base só para medi-lo
// custaria dezenas de MB por teste.
function computeBaseBytes(entries: SitemapEntry[]): number {
  const frame = sitemapBytes([])
  const samplePath = '/x'
  const perEntry =
    sitemapBytes([{ path: samplePath }]) -
    frame -
    samplePath.length * URL_COPIES
  const paths = entries.reduce((total, { path }) => total + path.length, 0)
  return frame + entries.length * perEntry + paths * URL_COPIES
}

function entriesAtByteSize(size: number): SitemapEntry[] {
  const entries = baseEntries()
  const padding = Math.floor((size - computeBaseBytes(entries)) / URL_COPIES)
  const perEntry = Math.floor(padding / entries.length)
  for (const entry of entries) entry.path += 'a'.repeat(perEntry)
  const [first] = entries
  if (first) first.path += 'a'.repeat(padding % entries.length)
  return entries
}

function manifest(sources: readonly SitemapRouteInfo[]): SitemapManifest {
  return { entries: [{ path: '/' }, { path: '/docs' }], sources }
}

function pathEntries(count: number): SitemapEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `/page-${index}`
  }))
}

// Sinal de uma requisição que continua aberta.
function openSignal(): AbortSignal {
  return new AbortController().signal
}

function locationsOf(xml: string): (string | undefined)[] {
  return [...xml.matchAll(/<loc>(?<url>[^<]+)<\/loc>/gu)].map(
    match => match.groups?.url
  )
}

type Outcome = readonly [
  status: number,
  cacheControl: string | null,
  body: string
]

const UNAVAILABLE: Outcome = [HTTP_SERVICE_UNAVAILABLE, 'no-store', '']

type CorruptOptions = {
  entry: SitemapEntry
  path: unknown
}

// Fonte em JavaScript que ignora o tipo: o schema da fronteira recusa.
function corrupt({ entry, path }: CorruptOptions): SitemapEntry {
  return Object.assign(entry, { path })
}

async function readOutcome(response: Response): Promise<Outcome> {
  return [
    response.status,
    response.headers.get('cache-control'),
    await response.text()
  ]
}

// O Vitest roda com DEV verdadeiro; os casos conferem o log de produção.
function mockProductionLog(): void {
  vi.stubEnv('DEV', false)
  vi.spyOn(console, 'error').mockImplementation(vi.fn())
}

describe('resposta do sitemap', () => {
  beforeEach(mockProductionLog)

  afterEach(() => {
    vi.useRealTimers()
  })

  it(
    'aceita XML imediatamente abaixo do limite de bytes após incluir os idiomas',
    { timeout: LARGE_SITEMAP_TIMEOUT_MS },
    async () => {
      const response = await buildSitemapResponse({
        siteUrl: SITE_URL,
        signal: openSignal(),
        manifest: {
          entries: entriesAtByteSize(SITEMAP_BYTE_LIMIT),
          sources: []
        }
      })
      const body = await response.arrayBuffer()
      expect(response.status).toBe(HTTP_OK)
      expect(body.byteLength).toBeLessThanOrEqual(SITEMAP_BYTE_LIMIT)
      expect(body.byteLength).toBeGreaterThan(SITEMAP_BYTE_LIMIT - URL_COPIES)
      expect(response.headers.get('cache-control')).toBe(SITE_CACHE_CONTROL)
    }
  )

  it(
    'responde 503 sem cache acima do limite após incluir os idiomas',
    { timeout: LARGE_SITEMAP_TIMEOUT_MS },
    async () => {
      const response = await buildSitemapResponse({
        siteUrl: SITE_URL,
        signal: openSignal(),
        manifest: {
          entries: entriesAtByteSize(SITEMAP_BYTE_LIMIT + URL_COPIES),
          sources: []
        }
      })
      await expect(readOutcome(response)).resolves.toStrictEqual(UNAVAILABLE)
    }
  )

  it('publica as páginas estáticas e depois as entradas das fontes, na ordem', async () => {
    const response = await buildSitemapResponse({
      siteUrl: SITE_URL,
      signal: openSignal(),
      manifest: manifest([
        () => [{ path: '/blog/a', lastmod: '2026-09-01' }],
        () => Promise.resolve([{ path: '/blog/b/' }])
      ])
    })

    expect(response.status).toBe(HTTP_OK)
    expect(response.headers.get('content-type')).toBe(
      'application/xml; charset=utf-8'
    )
    expect(response.headers.get('cache-control')).toBe(SITE_CACHE_CONTROL)
    const locations = locationsOf(await response.text())
    expect(locations).toStrictEqual([
      'https://example.com/pt',
      'https://example.com/en',
      'https://example.com/es',
      'https://example.com/pt/docs',
      'https://example.com/en/docs',
      'https://example.com/es/docs',
      'https://example.com/pt/blog/a',
      'https://example.com/en/blog/a',
      'https://example.com/es/blog/a',
      'https://example.com/pt/blog/b',
      'https://example.com/en/blog/b',
      'https://example.com/es/blog/b'
    ])
  })

  it('publica só path e lastmod da fonte e mantém a página estática em caminho repetido', async () => {
    const response = await buildSitemapResponse({
      siteUrl: SITE_URL,
      signal: openSignal(),
      manifest: manifest([
        () => [
          { path: '/docs', lastmod: '2026-09-21' },
          { path: '/x', lastmod: '2026-09-21', title: 'Não publicado' }
        ]
      ])
    })
    const xml = await response.text()

    expect(xml).toContain(
      '<url><loc>https://example.com/pt/docs</loc><xhtml:link'
    )
    expect(xml).toContain(
      '<url><loc>https://example.com/pt/x</loc><lastmod>2026-09-21</lastmod>'
    )
    expect(xml).not.toContain('Não publicado')
  })

  it('monta o sitemap sem fontes', async () => {
    const response = await buildSitemapResponse({
      siteUrl: SITE_URL,
      signal: openSignal(),
      manifest: manifest([])
    })

    expect(response.status).toBe(HTTP_OK)
    await expect(response.text()).resolves.toContain(
      '<loc>https://example.com/pt/docs</loc>'
    )
  })

  it('responde 503 sem corpo e sem cache e registra só a linha fixa quando uma fonte rejeita', async () => {
    const response = await buildSitemapResponse({
      siteUrl: SITE_URL,
      signal: openSignal(),
      manifest: manifest([
        () => [{ path: '/blog/a' }],
        () =>
          Promise.reject(
            new Error('PRIVATE_DATABASE', { cause: 'PRIVATE_CAUSE' })
          )
      ])
    })

    await expect(readOutcome(response)).resolves.toStrictEqual(UNAVAILABLE)
    expect(readLog(console.error)).toStrictEqual({
      heads: [[SITEMAP_LOG, 'Error']],
      leaks: []
    })
  })

  it('imprime o erro original depois da linha filtrada em desenvolvimento', async () => {
    vi.stubEnv('DEV', true)
    const failure = new Error('PRIVATE')

    const response = await buildSitemapResponse({
      siteUrl: SITE_URL,
      signal: openSignal(),
      manifest: manifest([() => Promise.reject(failure)])
    })

    await expect(readOutcome(response)).resolves.toStrictEqual(UNAVAILABLE)
    expect(readLog(console.error).heads[0]).toStrictEqual([
      SITEMAP_LOG,
      'Error'
    ])
    expect(vi.mocked(console.error).mock.calls.slice(1)).toStrictEqual([
      [failure]
    ])
  })

  it('responde 503 quando uma fonte devolve um caminho fora do site', async () => {
    const response = await buildSitemapResponse({
      siteUrl: SITE_URL,
      signal: openSignal(),
      manifest: manifest([() => [{ path: 'https://evil.test/x' }]])
    })

    await expect(readOutcome(response)).resolves.toStrictEqual(UNAVAILABLE)
  })

  it('responde 503 quando uma fonte devolve uma entrada fora do contrato', async () => {
    const response = await buildSitemapResponse({
      siteUrl: SITE_URL,
      signal: openSignal(),
      manifest: manifest([
        () => [corrupt({ entry: { path: '/ok' }, path: 42 })]
      ])
    })

    await expect(readOutcome(response)).resolves.toStrictEqual(UNAVAILABLE)
  })
})

describe('prazo e cancelamento das fontes do sitemap', () => {
  beforeEach(mockProductionLog)

  afterEach(() => {
    vi.useRealTimers()
  })

  it('responde 503 e aborta o sinal das fontes quando elas estouram o prazo', async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    const pending = buildSitemapResponse({
      siteUrl: SITE_URL,
      signal: openSignal(),
      manifest: manifest([
        signal => {
          signals.push(signal)
          return Promise.withResolvers<never[]>().promise
        }
      ])
    })
    await vi.advanceTimersByTimeAsync(SITEMAP_SOURCES_TIMEOUT_MS - 1)
    expect(signals.map(signal => signal.aborted)).toStrictEqual([false])
    await vi.advanceTimersByTimeAsync(1)

    await expect(readOutcome(await pending)).resolves.toStrictEqual(UNAVAILABLE)
    expect(signals.map(signal => signal.aborted)).toStrictEqual([true])
    expect(readLog(console.error).heads).toStrictEqual([[SITEMAP_LOG, 'Error']])
  })

  it('aborta o sinal das fontes quando o cliente desconecta', async () => {
    const request = new AbortController()
    const { promise: received, resolve } = Promise.withResolvers<AbortSignal>()
    const pending = buildSitemapResponse({
      siteUrl: SITE_URL,
      signal: request.signal,
      manifest: manifest([
        signal => {
          resolve(signal)
          return Promise.withResolvers<never[]>().promise
        }
      ])
    })
    const signal = await received
    expect(signal.aborted).toBe(false)
    request.abort()

    await expect(readOutcome(await pending)).resolves.toStrictEqual(UNAVAILABLE)
    expect(signal.aborted).toBe(true)
  })

  it('não chama as fontes quando a requisição já foi abortada', async () => {
    const source = vi.fn<SitemapRouteInfo>(() => [])
    const response = await buildSitemapResponse({
      siteUrl: SITE_URL,
      signal: AbortSignal.abort(),
      manifest: manifest([source])
    })

    await expect(readOutcome(response)).resolves.toStrictEqual(UNAVAILABLE)
    expect(source).not.toHaveBeenCalled()
  })

  it('aborta as fontes pendentes quando outra fonte falha', async () => {
    const { promise: received, resolve } = Promise.withResolvers<AbortSignal>()
    const response = await buildSitemapResponse({
      siteUrl: SITE_URL,
      signal: openSignal(),
      manifest: manifest([
        signal => {
          resolve(signal)
          return Promise.withResolvers<never[]>().promise
        },
        () => Promise.reject(new Error('PRIVATE_SOURCE'))
      ])
    })

    await expect(readOutcome(response)).resolves.toStrictEqual(UNAVAILABLE)
    await expect(received).resolves.toHaveProperty('aborted', true)
  })
})

describe('limite de URLs e duplicatas do sitemap', () => {
  beforeEach(mockProductionLog)

  it(
    'aceita o limite de URLs depois de gerar uma URL por idioma',
    { timeout: LARGE_SITEMAP_TIMEOUT_MS },
    async () => {
      const response = await buildSitemapResponse({
        siteUrl: SITE_URL,
        signal: openSignal(),
        manifest: { entries: pathEntries(ENTRIES_AT_URL_LIMIT), sources: [] }
      })

      expect(response.status).toBe(HTTP_OK)
      expect(locationsOf(await response.text())).toHaveLength(
        ENTRIES_AT_URL_LIMIT * locales.length
      )
    }
  )

  it(
    'responde 503 uma entrada acima do limite de URLs depois da localização',
    { timeout: LARGE_SITEMAP_TIMEOUT_MS },
    async () => {
      const response = await buildSitemapResponse({
        siteUrl: SITE_URL,
        signal: openSignal(),
        manifest: {
          entries: pathEntries(ENTRIES_AT_URL_LIMIT + 1),
          sources: []
        }
      })

      await expect(readOutcome(response)).resolves.toStrictEqual(UNAVAILABLE)
    }
  )

  it.each([
    ['/b', '/a/../b', 'https://example.com/pt/b'],
    ['/caf%C3%A9', '/café', 'https://example.com/pt/caf%C3%A9'],
    ['/blog/x', '/pt/blog/x', 'https://example.com/pt/blog/x']
  ])(
    'publica uma vez a URL de %s e da fonte %s, com o lastmod da página estática',
    async (staticPath, sourcePath, url) => {
      const response = await buildSitemapResponse({
        siteUrl: SITE_URL,
        signal: openSignal(),
        manifest: {
          entries: [{ path: staticPath, lastmod: '2026-09-01' }],
          sources: [() => [{ path: sourcePath, lastmod: '2026-09-21' }]]
        }
      })
      const xml = await response.text()

      expect(locationsOf(xml)).toStrictEqual(
        locales.map(locale => url.replace('/pt', `/${locale}`))
      )
      expect(xml).not.toContain('2026-09-21')
    }
  )
})
