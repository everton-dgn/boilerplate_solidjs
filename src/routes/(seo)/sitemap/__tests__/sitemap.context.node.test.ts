import type { APIEvent } from 'filesystem-routing/api'

import type { SitemapEntry } from '@/@types/sitemap.ts'
import {
  HTTP_NOT_FOUND,
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE
} from '@/constants/http.ts'
import {
  PUBLICATION_PHASE_ENV,
  PUBLICATION_PRERENDER_PHASE
} from '@/constants/publication.ts'

type Handler = (event: APIEvent) => Promise<Response>

describe('contexto compartilhado dos handlers de sitemap', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it.each([
    { isProduction: true, expectedCollections: 1 },
    { isProduction: false, expectedCollections: 4 }
  ])(
    'compartilha em produção e atualiza em desenvolvimento: $isProduction',
    async ({ isProduction, expectedCollections }) => {
      vi.resetModules()
      vi.stubEnv('PROD', isProduction)
      vi.stubEnv(PUBLICATION_PHASE_ENV, PUBLICATION_PRERENDER_PHASE)
      const collector =
        await import('../helpers/collectSitemapEntries/index.ts')
      const collect = vi
        .spyOn(collector, 'collectSitemapEntries')
        .mockReturnValue({
          entries: [{ path: '/' }],
          sources: []
        })
      const root = await import('../../sitemap.xml/index.ts')
      const pages = await import('../../sitemaps/pages/[part].xml/index.ts')
      const source = await import('../../sitemaps/[source]/[part].xml/index.ts')
      const legacy = await import('../../sitemaps/legacy.xml/index.ts')
      const calls: [Handler, string, number][] = [
        [root.GET, '/sitemap.xml', HTTP_OK],
        [pages.GET, '/sitemaps/pages/1.xml', HTTP_OK],
        [source.GET, '/sitemaps/absent/a.xml', HTTP_NOT_FOUND],
        [legacy.GET, '/sitemaps/legacy.xml', HTTP_NOT_FOUND]
      ]
      for (const [handler, path, status] of calls) {
        const response = await handler({
          request: new Request(`https://example.com${path}`)
        })
        expect(response.status).toBe(status)
      }
      expect(collect).toHaveBeenCalledTimes(expectedCollections)
    }
  )

  it('não percorre rotas nem aceita o inventário fora do prerender', async () => {
    vi.resetModules()
    vi.stubEnv('PROD', true)
    vi.stubEnv(PUBLICATION_PHASE_ENV, '')
    vi.stubGlobal('__nitro_main__', 'file:///absent/index.mjs')
    vi.spyOn(console, 'error').mockReturnValue()
    const collector = await import('../helpers/collectSitemapEntries/index.ts')
    const collect = vi.spyOn(collector, 'collectSitemapEntries')
    const pages = await import('../../sitemaps/pages/[part].xml/index.ts')
    const source = await import('../../sitemaps/[source]/[part].xml/index.ts')
    const inventory = await import('../../sitemaps/static.json/index.ts')
    const invalid = await pages.GET({
      request: new Request('https://example.com/sitemaps/pages/x.xml')
    })
    expect(invalid.status).toBe(HTTP_NOT_FOUND)
    const missing = await pages.GET({
      request: new Request('https://example.com/sitemaps/pages/1.xml')
    })
    expect({
      status: missing.status,
      cacheControl: missing.headers.get('cache-control')
    }).toStrictEqual({
      status: HTTP_SERVICE_UNAVAILABLE,
      cacheControl: 'no-store'
    })
    const absent = await source.GET({
      request: new Request('https://example.com/sitemaps/absent/a.xml')
    })
    expect(absent.status).toBe(HTTP_NOT_FOUND)
    const listing = await inventory.GET()
    expect({
      status: listing.status,
      cacheControl: listing.headers.get('cache-control')
    }).toStrictEqual({ status: HTTP_NOT_FOUND, cacheControl: 'no-store' })
    expect(collect).not.toHaveBeenCalled()
  })

  it('responde o inventário só no prerender, sem chamar fontes', async () => {
    vi.resetModules()
    vi.stubEnv('PROD', true)
    vi.stubEnv(PUBLICATION_PHASE_ENV, PUBLICATION_PRERENDER_PHASE)
    vi.stubEnv('PUBLICATION_BUILD_ID', 'build-under-test')
    const readLegacy = vi.fn<() => SitemapEntry[]>(() => [])
    const collector = await import('../helpers/collectSitemapEntries/index.ts')
    vi.spyOn(collector, 'collectSitemapEntries').mockReturnValue({
      entries: [{ path: '/' }],
      sources: [readLegacy],
      sourceRoutes: ['/blog/:slug']
    })
    const inventory = await import('../../sitemaps/static.json/index.ts')
    const response = await inventory.GET()
    expect(response.status).toBe(HTTP_OK)
    await expect(response.json()).resolves.toMatchObject({
      buildId: 'build-under-test',
      pagePartCount: 1,
      hasLegacySources: true,
      hasPartitionSources: false,
      identities: { entries: [{ path: '/' }] }
    })
    expect(readLegacy).not.toHaveBeenCalled()
  })
})
