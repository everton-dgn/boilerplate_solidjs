import {
  createComponent,
  createRequestEvent,
  renderToStream,
  ssr,
  type RequestEvent
} from '@solidjs/web'
import { createMemo, Loading, onCleanup } from 'solid-js'

import { SITE } from '@/constants/site.ts'
import { Router } from '@/router.ts'

import {
  MARKDOWN_PRERENDER_PATH,
  MARKDOWN_TIMEOUT_MS,
  MAX_HTML_BYTES
} from '../constants.ts'
import { markdownContent } from '../index.ts'

vi.mock(import('../helpers/collectStaticMarkdownPages/index.ts'), () => ({
  collectStaticMarkdownPages: () => ['/pt', '/en/about', '/en/private']
}))

const HTTP_OK = 200
const HTTP_MOVED_PERMANENTLY = 301
const HTTP_FOUND = 302
const HTTP_SEE_OTHER = 303
const HTTP_REDIRECT = 307
const HTTP_PERMANENT_REDIRECT = 308
const HTTP_BAD_REQUEST = 400
const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const HTTP_NOT_ACCEPTABLE = 406
const HTTP_SERVER_ERROR = 500
const HTTP_UNAVAILABLE = 503

type Options = {
  path?: string
  accept?: string
  method?: string
  signal?: AbortSignal
}

function event({
  path = '/en/about',
  accept = 'text/markdown',
  method = 'GET',
  signal
}: Options = {}): RequestEvent {
  const request = createRequestEvent(
    new Request(`https://example.com${path}`, {
      method,
      headers: { accept },
      signal
    })
  )
  request.locals.ssrRenderState = { hasErrors: false, hasCompleted: true }
  return request
}

function html(
  body = '<main><h1>Title</h1><p>Public content</p></main>',
  status = HTTP_OK
) {
  return Promise.resolve(
    new Response(body, {
      status,
      headers: { 'content-type': 'text/html', vary: 'Cookie' }
    })
  )
}

function pendingPage(cleanup: () => void) {
  onCleanup(cleanup)
  return ssr(
    ['<main>', '</main>'],
    createComponent(Loading, {
      fallback: 'Waiting',
      get children() {
        const value = createMemo(() => Promise.withResolvers<string>().promise)
        return ssr(
          ['<p>', '</p>'],
          createMemo(() => value())
        )
      }
    })
  )
}

function mockPublishedRoute() {
  vi.stubEnv('DEV', false)
  vi.spyOn(Router, 'match').mockReturnValue([
    {
      path: '/about',
      pattern: '/about',
      match: '/about',
      params: {},
      info: { markdown: true }
    }
  ])
}

describe('html-derived Markdown', () => {
  beforeEach(mockPublishedRoute)

  it('converts settled HTML with a full document URL, semantic filters and contextual footer', async () => {
    const request = event({ path: '/en/docs/article.md?version=2' })
    const response = await markdownContent(request, () =>
      html(
        '<nav>Navigation</nav><main><h1>Title</h1><a href="./next">Next</a><p hidden>Hidden</p><p aria-hidden="true">ARIA</p><p data-md-exclude>Excluded</p><script>Secret script</script><button>Control</button><menu>Menu controls</menu><footer><a href="source">Citation</a></footer><aside>Contextual aside</aside></main>'
      )
    )
    const body = await response.text()
    expect({
      mode: request.renderMode,
      url: request.request.url,
      ...Object.fromEntries(response.headers),
      hasNoScripts: response.headers
        .get('content-security-policy')
        ?.includes("script-src 'none'")
    }).toMatchObject({
      mode: 'async',
      url: 'https://example.com/en/docs/article?version=2',
      'cache-control': 'private, no-store',
      vary: 'Cookie, Accept',
      hasNoScripts: true
    })
    expect(body).toMatch(/# Title[\s\S]*Contextual aside/u)
    expect(body).toContain(`[Next](${new URL('/en/docs/next', SITE.url).href})`)
    expect(body).toContain(
      `[Citation](${new URL('/en/docs/source', SITE.url).href})`
    )
    expect(body).not.toMatch(
      /Navigation|Hidden|ARIA|Excluded|Secret script|Control|Menu controls/u
    )
  })

  it('keeps ordinary HTML streaming and response identity', async () => {
    const request = event({ accept: 'text/html' })
    const original = await html()
    const response = await markdownContent(request, () =>
      Promise.resolve(original)
    )
    expect(response).toBe(original)
    expect(request.renderMode).toBeUndefined()
  })
})

function prerender(path: string): RequestEvent {
  return createRequestEvent(
    new Request(`https://example.com${path}`, {
      headers: { 'x-nitro-prerender': path }
    })
  )
}

describe('build-time Markdown', () => {
  it.each([
    HTTP_MOVED_PERMANENTLY,
    HTTP_FOUND,
    HTTP_SEE_OTHER,
    HTTP_REDIRECT,
    HTTP_PERMANENT_REDIRECT
  ])(
    'fails the prerender instead of publishing an HTTP %s redirect body',
    async status => {
      mockPublishedRoute()
      const cancel = vi.fn<() => void>()
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('Redirect body'))
        },
        cancel
      })
      const response = await markdownContent(prerender('/en/about.md'), () =>
        Promise.resolve(
          new Response(body, {
            status,
            headers: { location: '/en/contact' }
          })
        )
      )
      expect(response.status).toBe(HTTP_SERVER_ERROR)
      expect(response.headers.has('location')).toBe(false)
      await expect(response.text()).resolves.not.toContain('Redirect body')
      expect(cancel).toHaveBeenCalledOnce()
    }
  )

  it('lists the publishable static pages for the build prerender', async () => {
    vi.spyOn(Router, 'match').mockImplementation(href => {
      const { pathname } = new URL(href)
      return [
        {
          path: pathname,
          pattern: pathname,
          match: pathname,
          params: {},
          info: {
            markdown: true,
            seo: { noindex: pathname === '/en/private' }
          }
        }
      ]
    })
    const next = vi.fn<() => Promise<Response>>(() => html())
    const response = await markdownContent(
      prerender(MARKDOWN_PRERENDER_PATH),
      next
    )
    expect(next).not.toHaveBeenCalled()
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    await expect(response.json()).resolves.toStrictEqual([
      '/pt/index.md',
      '/en/about.md'
    ])
  })

  it('keeps the listing path private outside the prerender', async () => {
    const original = new Response('missing', { status: HTTP_NOT_FOUND })
    const response = await markdownContent(
      event({ path: MARKDOWN_PRERENDER_PATH, accept: 'application/json' }),
      () => Promise.resolve(original)
    )
    expect(response).toBe(original)
  })

  it('converts a dynamic page on request', async () => {
    vi.spyOn(Router, 'match').mockReturnValue([
      {
        path: '/blog',
        pattern: '/blog',
        match: '/blog',
        params: {},
        info: { markdown: 'dynamic' }
      }
    ])
    const response = await markdownContent(event({ path: '/en/blog.md' }), () =>
      html()
    )
    expect(response.status).toBe(HTTP_OK)
    expect(response.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    )
    await expect(response.text()).resolves.toContain('# Title')
  })
})

describe('markdown aliases and runtime publication', () => {
  beforeEach(mockPublishedRoute)

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

describe('markdown negotiation and redirects', () => {
  beforeEach(mockPublishedRoute)

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
          path: '/*HTTP_NOT_FOUND',
          pattern: '/*HTTP_NOT_FOUND',
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

describe('markdown resource bounds', () => {
  beforeEach(mockPublishedRoute)
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    undefined,
    { hasErrors: true, hasCompleted: true },
    { hasErrors: false, hasCompleted: false },
    { hasErrors: undefined, hasCompleted: true }
  ])(
    'refuses publication without completed error-free SSR: %j',
    async state => {
      const request = event()
      Object.assign(request.locals, { ssrRenderState: state })
      const response = await markdownContent(request, () => html())
      expect(response.status).toBe(HTTP_SERVER_ERROR)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      await expect(response.text()).resolves.not.toContain('Public content')
    }
  )

  it('normalizes a failed SSR response with an existing locale cookie', async () => {
    const request = event()
    request.request.headers.set('cookie', 'PARAGLIDE_LOCALE=en')
    request.locals.ssrRenderState = { hasErrors: true, hasCompleted: true }
    const response = await markdownContent(request, () =>
      html('Partial fallback', HTTP_SERVER_ERROR)
    )
    expect(response.status).toBe(HTTP_SERVER_ERROR)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    await expect(response.text()).resolves.not.toContain('Partial fallback')
  })

  // A contenção do middleware registra o log e responde 500 público.
  it('bounds conversion input', async () => {
    await expect(
      markdownContent(event(), () => html('x'.repeat(MAX_HTML_BYTES + 1)))
    ).rejects.toThrow('Markdown document limit exceeded')
  })

  it('propagates client cancellation to the render request', async () => {
    const controller = new AbortController()
    const request = event({ signal: controller.signal })
    const next = vi.fn<() => Promise<Response>>(
      () => Promise.withResolvers<Response>().promise
    )
    const pending = markdownContent(request, next)
    controller.abort()
    const response = await pending
    expect(response.status).toBe(HTTP_SERVER_ERROR)
    expect(request.request.signal.aborted).toBe(true)
  })

  it('bounds SSR waiting and aborts its signal on timeout', async () => {
    vi.useFakeTimers()
    const request = event()
    const pending = markdownContent(
      request,
      () => Promise.withResolvers<Response>().promise
    )
    await vi.advanceTimersByTimeAsync(MARKDOWN_TIMEOUT_MS)
    const response = await pending
    expect(response.status).toBe(HTTP_SERVER_ERROR)
    expect(request.request.signal.aborted).toBe(true)
  })

  it('disposes a pending native SSR root when its signal aborts', async () => {
    const controller = new AbortController()
    const request = event({ signal: controller.signal })
    const cleanup = vi.fn<() => void>()
    const render = async () => {
      const result = await renderToStream(() => pendingPage(cleanup), {
        signal: request.request.signal
      })
      return new Response(result, { headers: { 'content-type': 'text/html' } })
    }
    const pending = markdownContent(request, render)
    expect(cleanup).not.toHaveBeenCalled()
    controller.abort()
    const response = await pending
    expect(response.status).toBe(HTTP_SERVER_ERROR)
    expect(cleanup).toHaveBeenCalledOnce()
  })
})
