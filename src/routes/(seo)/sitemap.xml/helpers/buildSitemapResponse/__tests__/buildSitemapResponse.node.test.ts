import type { SitemapEntry, SitemapRouteInfo } from '@/@types/sitemap.ts'
import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'

import { SITEMAP_SOURCES_TIMEOUT_MS } from '../../../constants.ts'
import type { SitemapManifest } from '../../../types.ts'
import { buildSitemapResponse } from '../index.ts'

const SITE_URL = 'https://example.com'
const HTTP_OK = 200
const HTTP_SERVICE_UNAVAILABLE = 503

function manifest(sources: readonly SitemapRouteInfo[]): SitemapManifest {
  return { entries: [{ path: '/' }, { path: '/docs' }], sources }
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

describe('resposta do sitemap', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('publica as páginas estáticas e depois as entradas das fontes, na ordem', async () => {
    const response = await buildSitemapResponse({
      siteUrl: SITE_URL,
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
    await expect(response.text()).resolves.toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url><loc>https://example.com/</loc></url>',
        '  <url><loc>https://example.com/docs</loc></url>',
        '  <url><loc>https://example.com/blog/a</loc><lastmod>2026-09-01</lastmod></url>',
        '  <url><loc>https://example.com/blog/b</loc></url>',
        '</urlset>',
        ''
      ].join('\n')
    )
  })

  it('publica só path e lastmod da fonte e mantém a página estática em caminho repetido', async () => {
    const response = await buildSitemapResponse({
      siteUrl: SITE_URL,
      manifest: manifest([
        () => [
          { path: '/docs', lastmod: '2026-09-21' },
          { path: '/x', lastmod: '2026-09-21', title: 'Não publicado' }
        ]
      ])
    })
    const xml = await response.text()

    expect(xml).toContain('<url><loc>https://example.com/docs</loc></url>')
    expect(xml).toContain(
      '<url><loc>https://example.com/x</loc><lastmod>2026-09-21</lastmod></url>'
    )
    expect(xml).not.toContain('Não publicado')
  })

  it('monta o sitemap sem fontes', async () => {
    const response = await buildSitemapResponse({
      siteUrl: SITE_URL,
      manifest: manifest([])
    })

    expect(response.status).toBe(HTTP_OK)
    await expect(response.text()).resolves.toContain(
      '<loc>https://example.com/docs</loc>'
    )
  })

  it('responde 503 sem corpo e sem cache quando uma fonte rejeita', async () => {
    const response = await buildSitemapResponse({
      siteUrl: SITE_URL,
      manifest: manifest([
        () => [{ path: '/blog/a' }],
        () => Promise.reject(new Error('banco indisponível'))
      ])
    })

    await expect(readOutcome(response)).resolves.toStrictEqual(UNAVAILABLE)
  })

  it('responde 503 quando uma fonte devolve um caminho fora do site', async () => {
    const response = await buildSitemapResponse({
      siteUrl: SITE_URL,
      manifest: manifest([() => [{ path: 'https://evil.test/x' }]])
    })

    await expect(readOutcome(response)).resolves.toStrictEqual(UNAVAILABLE)
  })

  it('responde 503 quando uma fonte devolve uma entrada fora do contrato', async () => {
    const response = await buildSitemapResponse({
      siteUrl: SITE_URL,
      manifest: manifest([
        () => [corrupt({ entry: { path: '/ok' }, path: 42 })]
      ])
    })

    await expect(readOutcome(response)).resolves.toStrictEqual(UNAVAILABLE)
  })

  it('responde 503 quando as fontes estouram o prazo', async () => {
    vi.useFakeTimers()
    const pending = buildSitemapResponse({
      siteUrl: SITE_URL,
      manifest: manifest([() => Promise.withResolvers<never[]>().promise])
    })
    await vi.advanceTimersByTimeAsync(SITEMAP_SOURCES_TIMEOUT_MS)

    await expect(readOutcome(await pending)).resolves.toStrictEqual(UNAVAILABLE)
  })
})
