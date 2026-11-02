import type { APIEvent } from 'filesystem-routing/api'

import { HTTP_NOT_FOUND, HTTP_OK } from '@/constants/http.ts'

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
})
