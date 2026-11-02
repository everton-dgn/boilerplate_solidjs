import { Router } from '@/router.ts'

import {
  markdownContent,
  event,
  html,
  mockPublishedRoute,
  resetPublicationController,
  cancelOpenResponses
} from './fixtures.ts'

const HTTP_OK = 200
const HTTP_REDIRECT = 307
const HTTP_NOT_FOUND = 404

describe('markdown aliases and runtime publication', () => {
  beforeEach(() => {
    resetPublicationController()
    mockPublishedRoute()
  })
  afterEach(cancelOpenResponses)

  it.each([
    ['/index.md', '/'],
    ['/pt/index.md', '/pt'],
    ['/en/index.md', '/en'],
    ['/es/index.md', '/es'],
    ['/index/index.md', '/index'],
    ['/index/index/index.md', '/index/index'],
    ['/foo/index/index.md', '/foo/index'],
    ['/pt/index/index.md', '/pt/index'],
    ['/en/index/index/index.md', '/en/index/index'],
    ['/es/foo/index/index.md', '/es/foo/index']
  ])('decodes %s once without losing its query', async (alias, path) => {
    const request = event({ path: `${alias}?version=2` })
    const response = await markdownContent(request, () => html())
    expect(request.request.url).toBe(`https://example.com${path}?version=2`)
    expect(response.status).toBe(HTTP_OK)
    expect(response.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    )
  })

  it.each([
    ['GET', 'nofollow, NoIndex'],
    ['HEAD', 'nofollow, NoIndex'],
    ['GET', 'none'],
    ['GET', 'googlebot: none']
  ])(
    'rejects a %s alias when the rendered response sends X-Robots-Tag %s',
    async (method, robots) => {
      const cancel = vi.fn<() => void>()
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('Private HTML'))
        },
        cancel
      })
      const original = new Response(body, {
        headers: {
          'content-type': 'text/html',
          'x-robots-tag': robots,
          'cache-control': 'public, max-age=3600'
        }
      })
      const response = await markdownContent(
        event({ path: '/en/about.md', method }),
        () => Promise.resolve(original)
      )
      expect(response.status).toBe(HTTP_NOT_FOUND)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(response.headers.get('content-type')).toBe(
        'text/plain; charset=utf-8'
      )
      await expect(response.text()).resolves.toBe('')
      expect(cancel).toHaveBeenCalledOnce()
    }
  )

  it.each(['max-image-preview:none', 'max-image-preview: none, nosnippet'])(
    'keeps publishing an alias with X-Robots-Tag %s',
    async robots => {
      const original = await html()
      original.headers.set('x-robots-tag', robots)
      const response = await markdownContent(
        event({ path: '/en/about.md' }),
        () => Promise.resolve(original)
      )
      expect(response.status).toBe(HTTP_OK)
      expect(response.headers.get('content-type')).toBe(
        'text/markdown; charset=utf-8'
      )
    }
  )

  it('preserves HTML fallback on the original URL with runtime noindex', async () => {
    const original = await html('Private HTML')
    original.headers.set('x-robots-tag', 'noindex')
    const response = await markdownContent(event(), () =>
      Promise.resolve(original)
    )
    expect(response).toBe(original)
    await expect(response.text()).resolves.toBe('Private HTML')
  })

  it.each(['GET', 'HEAD'])(
    'answers a %s alias without opt-in with a localized 404 and no render',
    async method => {
      vi.spyOn(Router, 'match').mockReturnValue([
        {
          path: '/account',
          pattern: '/account',
          match: '/account',
          params: {},
          info: {}
        }
      ])
      const next = vi.fn<() => Promise<Response>>(() => html())
      const response = await markdownContent(
        event({ method, path: '/pt/account.md' }),
        next
      )
      expect(next).not.toHaveBeenCalled()
      expect({
        status: response.status,
        type: response.headers.get('content-type'),
        cache: response.headers.get('cache-control'),
        robots: response.headers.get('x-robots-tag'),
        language: response.headers.get('content-language')
      }).toStrictEqual({
        status: HTTP_NOT_FOUND,
        type: 'text/plain; charset=utf-8',
        cache: 'private, no-store',
        robots: 'noindex',
        language: 'pt'
      })
      await expect(response.text()).resolves.toBe(
        method === 'HEAD' ? '' : 'A página solicitada não foi encontrada.'
      )
    }
  )

  it.each(['/pt/about/.md', '/en/docs/index.md'])(
    'answers the non-canonical alias %s with a 404 and no render',
    async path => {
      const next = vi.fn<() => Promise<Response>>(() => html())
      const response = await markdownContent(event({ path }), next)
      expect(next).not.toHaveBeenCalled()
      expect(response.status).toBe(HTTP_NOT_FOUND)
    }
  )

  // Sem prefixo de idioma, /pt.md segue o redirect dos caminhos sem idioma.
  it('does not publish the home through /pt.md', async () => {
    const next = vi.fn<() => Promise<Response>>(() => html())
    const response = await markdownContent(event({ path: '/pt.md' }), next)
    expect(next).not.toHaveBeenCalled()
    expect(response.status).toBe(HTTP_REDIRECT)
    expect(response.headers.get('location')).toBe(
      'https://example.com/en/pt.md'
    )
  })
})
