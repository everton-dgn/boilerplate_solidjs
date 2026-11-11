import { createRequestEvent } from '@solidjs/web'
import { createAPIHandler } from 'filesystem-routing/api'

import { HTTP_NOT_FOUND, HTTP_OK } from '@/constants/http.ts'
import type { SitemapContext } from '@/routes/(seo)/sitemap/types.ts'
import { GET as sourceGET } from '@/routes/(seo)/sitemaps/[source]/[part].xml/index.ts'

import { GET as pageGET } from '../index.ts'

const { readSitemapContext, buildSitemapPartResponse } = vi.hoisted(() => ({
  readSitemapContext: vi.fn<() => SitemapContext>(() => ({
    manifest: { entries: [], sources: [] }
  })),
  buildSitemapPartResponse: vi.fn<() => Promise<Response>>(() =>
    Promise.resolve(new Response(null, { status: 200 }))
  )
}))

vi.mock(
  import('@/routes/(seo)/sitemap/helpers/readSitemapContext/index.ts'),
  () => ({
    readSitemapContext
  })
)
vi.mock(
  import('@/routes/(seo)/sitemap/helpers/sitemapService/index.ts'),
  () => ({
    buildSitemapPartResponse
  })
)

const handler = createAPIHandler([
  {
    path: '/(seo)/sitemaps/pages/:part.xml/',
    $GET: { require: () => ({ GET: pageGET }) },
    $HEAD: { require: () => ({ GET: pageGET }) }
  },
  {
    path: '/(seo)/sitemaps/:source/:part.xml/',
    $GET: { require: () => ({ GET: sourceGET }) },
    $HEAD: { require: () => ({ GET: sourceGET }) }
  }
])

describe('sitemap part suffix', () => {
  beforeEach(() => {
    readSitemapContext.mockClear()
    buildSitemapPartResponse.mockClear()
  })

  it.each([
    ['GET', '/sitemaps/pages/1'],
    ['HEAD', '/sitemaps/pages/1?ref=check'],
    ['GET', '/sitemaps/blog/1'],
    ['HEAD', '/sitemaps/blog/1?ref=check'],
    ['GET', '/sitemaps/pages/1.xml.json'],
    ['HEAD', '/sitemaps/blog/1.XML'],
    ['GET', '/sitemaps/pages/1%2Exml'],
    ['HEAD', '/sitemaps/blog/1.xml/']
  ])(
    'rejects suffixless %s %s before reading sitemap state',
    async (method, path) => {
      const next = vi.fn<() => Response>(
        () => new Response(null, { status: HTTP_NOT_FOUND })
      )
      const response = await handler(
        createRequestEvent(
          new Request(`https://example.com${path}`, { method })
        ),
        next
      )
      expect(response).toMatchObject({ status: HTTP_NOT_FOUND, body: null })
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(next).not.toHaveBeenCalled()
      expect(readSitemapContext).not.toHaveBeenCalled()
      expect(buildSitemapPartResponse).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['GET', '/sitemaps/pages/1.xml?ref=check', 'pages'],
    ['HEAD', '/sitemaps/pages/1.xml', 'pages'],
    ['GET', '/sitemaps/blog/1.xml', 'source'],
    ['HEAD', '/sitemaps/blog/1.xml?ref=check', 'source']
  ])('keeps canonical %s %s routed', async (method, path, kind) => {
    const response = await handler(
      createRequestEvent(new Request(`https://example.com${path}`, { method })),
      vi.fn<() => Response>(
        () => new Response(null, { status: HTTP_NOT_FOUND })
      )
    )
    expect(response.status).toBe(HTTP_OK)
    expect(readSitemapContext).toHaveBeenCalledOnce()
    expect(buildSitemapPartResponse).toHaveBeenCalledWith(
      expect.objectContaining({ kind, part: '1', method })
    )
  })

  it.each([
    ['/sitemaps/pages/1.xml.xml', 'pages'],
    ['/sitemaps/blog/1.xml.xml', 'source']
  ])('leaves part ID validation to the service for %s', async (path, kind) => {
    await handler(
      createRequestEvent(new Request(`https://example.com${path}`)),
      vi.fn<() => Response>(
        () => new Response(null, { status: HTTP_NOT_FOUND })
      )
    )
    expect(buildSitemapPartResponse).toHaveBeenCalledWith(
      expect.objectContaining({ kind, part: '1.xml' })
    )
  })
})
