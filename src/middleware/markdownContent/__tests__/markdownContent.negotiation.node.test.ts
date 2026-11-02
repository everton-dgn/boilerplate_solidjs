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
const HTTP_BAD_REQUEST = 400
const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const HTTP_NOT_ACCEPTABLE = 406
const HTTP_SERVER_ERROR = 500
const HTTP_UNAVAILABLE = 503

describe('markdown negotiation and redirects', () => {
  beforeEach(() => {
    resetPublicationController()
    mockPublishedRoute()
  })
  afterEach(cancelOpenResponses)

  it.each([
    ['text/html;q=1,text/markdown;q=0.2', HTTP_OK],
    ['text/*;q=1,text/markdown;q=0', HTTP_NOT_ACCEPTABLE],
    ['text/markdown;q=0', HTTP_NOT_ACCEPTABLE],
    ['application/json', HTTP_NOT_ACCEPTABLE]
  ])(
    'selects explicit .md with independent quality: %s',
    async (accept, status) => {
      const response = await markdownContent(
        event({ path: '/en/about.md', accept }),
        () => html()
      )
      expect(response.status).toBe(status)
    }
  )

  it('rejects unacceptable negotiation without rendering', async () => {
    const next = vi.fn<() => Promise<Response>>(() => html())
    const response = await markdownContent(
      event({ accept: 'application/json' }),
      next
    )
    expect(response.status).toBe(HTTP_NOT_ACCEPTABLE)
    expect(next).not.toHaveBeenCalled()
  })

  it.each(['/_server', '/assets/app.js', '/images/photo.png'])(
    'passes non-page %s through',
    async path => {
      const original = new Response('asset')
      const request = event({ path })
      const response = await markdownContent(request, () =>
        Promise.resolve(original)
      )
      expect(response).toBe(original)
      expect(request.renderMode).toBeUndefined()
    }
  )

  it('keeps non-GET methods unconverted', async () => {
    const original = await html()
    const response = await markdownContent(event({ method: 'POST' }), () =>
      Promise.resolve(original)
    )
    expect(response).toBe(original)
  })

  it('renders HEAD with GET then strips every body', async () => {
    const request = event({ method: 'HEAD', path: '/en/about.md' })
    const response = await markdownContent(request, () => html())
    expect(request.request.method).toBe('GET')
    expect(response.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    )
    await expect(response.text()).resolves.toBe('')
  })

  it('does not publish a success page without opt-in', async () => {
    vi.spyOn(Router, 'match').mockReturnValue([
      {
        path: '/account',
        pattern: '/account',
        match: '/account',
        params: {},
        info: {}
      }
    ])
    const original = await html('private')
    const response = await markdownContent(event(), () =>
      Promise.resolve(original)
    )
    expect(response).toBe(original)
  })

  it.each(['/en/missing', '/en/missing.md'])(
    'converts the real not-found page at %s and preserves its status',
    async path => {
      vi.spyOn(Router, 'match').mockReturnValue([
        {
          path: '/*404',
          pattern: '/*404',
          match: '/missing',
          params: {},
          info: { seo: { noindex: true } }
        }
      ])
      const response = await markdownContent(event({ path }), () =>
        html('<main><h1>Not found</h1></main>', HTTP_NOT_FOUND)
      )
      expect(response.status).toBe(HTTP_NOT_FOUND)
      expect(response.headers.get('x-robots-tag')).toBe('noindex')
      await expect(response.text()).resolves.toContain('# Not found')
    }
  )

  it.each([
    HTTP_UNAUTHORIZED,
    HTTP_FORBIDDEN,
    HTTP_SERVER_ERROR,
    HTTP_UNAVAILABLE
  ])('does not convert HTTP %s', async status => {
    const original = await html('error', status)
    await expect(
      markdownContent(event(), () => Promise.resolve(original))
    ).resolves.toBe(original)
  })

  it('keeps same-origin redirects in Markdown without following them', async () => {
    const response = await markdownContent(
      event({ path: '/en/about.md' }),
      () =>
        Promise.resolve(
          Response.redirect('https://example.com/en/contact?x=1', HTTP_REDIRECT)
        )
    )
    expect(response.status).toBe(HTTP_REDIRECT)
    expect(response.headers.get('location')).toBe('/en/contact.md?x=1')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('vary')).toBe('Accept')
  })

  it('preserves immutable external redirects with private negotiation headers', async () => {
    const original = Response.redirect(
      'https://external.example/page',
      HTTP_REDIRECT
    )
    const response = await markdownContent(
      event({ path: '/en/about.md' }),
      () => Promise.resolve(original)
    )
    expect(response.status).toBe(HTTP_REDIRECT)
    expect(response.headers.get('location')).toBe(
      'https://external.example/page'
    )
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('vary')).toBe('Accept')
  })

  it.each([
    ['https://external.example/page', 'Cookie', 'Cookie, Accept'],
    ['/en/account', 'Accept-Language', 'Accept-Language, Accept'],
    ['/en/private', 'Cookie', 'Cookie, Accept'],
    ['/en/contact.md', 'Cookie, Accept', 'Cookie, Accept'],
    ['/en/account', '*', '*'],
    [undefined, '*', '*']
  ])(
    'preserves %s redirects without public caching or duplicate Vary',
    async (location, vary, expectedVary) => {
      vi.spyOn(Router, 'match').mockImplementation(href => [
        {
          path: '/about',
          pattern: '/about',
          match: '/about',
          params: {},
          info: {
            markdown: !new URL(href).pathname.endsWith('/account'),
            seo: { noindex: new URL(href).pathname.endsWith('/private') }
          }
        }
      ])
      const headers = new Headers({
        vary,
        'cache-control': 'public, max-age=3600'
      })
      if (location) headers.set('location', location)
      const response = await markdownContent(
        event({ path: '/en/about.md' }),
        () =>
          Promise.resolve(
            new Response(null, {
              status: HTTP_REDIRECT,
              headers
            })
          )
      )
      expect(response.status).toBe(HTTP_REDIRECT)
      expect(response.headers.get('location')).toBe(location ?? null)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(response.headers.get('vary')).toBe(expectedVary)
    }
  )

  it('rejects an unacceptable alias before rendering a redirect', async () => {
    const next = vi.fn<() => Promise<Response>>(() =>
      Promise.resolve(Response.redirect('https://external.example/page'))
    )
    const response = await markdownContent(
      event({ path: '/en/about.md', accept: 'text/markdown;q=0' }),
      next
    )
    expect(response.status).toBe(HTTP_NOT_ACCEPTABLE)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('vary')).toContain('Accept')
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects malformed encoding with a public response', async () => {
    const next = vi.fn<() => Promise<Response>>(() => html())
    const response = await markdownContent(event({ path: '/en/%E0.md' }), next)
    expect(response.status).toBe(HTTP_BAD_REQUEST)
    expect(next).not.toHaveBeenCalled()
  })
})
