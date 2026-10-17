import {
  createComponent,
  createRequestEvent,
  renderToStream,
  ssr,
  type RequestEvent
} from '@solidjs/web'
import { createMemo, Loading, onCleanup } from 'solid-js'

import { Router } from '@/router.ts'

import { MARKDOWN_TIMEOUT_MS, MAX_HTML_BYTES } from '../constants.ts'
import { markdownContent } from '../index.ts'

const HTTP_OK = 200
const HTTP_REDIRECT = 307
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

describe('html-derived Markdown', () => {
  beforeEach(() => {
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
  })

  afterEach(() => {
    vi.useRealTimers()
  })

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
    expect(body).toContain('[Next](https://example.com/en/docs/next)')
    expect(body).toContain('[Citation](https://example.com/en/docs/source)')
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

  it('converts a negotiated HTTP_NOT_FOUND and preserves its status', async () => {
    vi.spyOn(Router, 'match').mockReturnValue([
      {
        path: '/*HTTP_NOT_FOUND',
        pattern: '/*HTTP_NOT_FOUND',
        match: '/missing',
        params: {},
        info: { seo: { noindex: true } }
      }
    ])
    const response = await markdownContent(event({ path: '/en/missing' }), () =>
      html('<main><h1>Not found</h1></main>', HTTP_NOT_FOUND)
    )
    expect(response.status).toBe(HTTP_NOT_FOUND)
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    await expect(response.text()).resolves.toContain('# Not found')
  })

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
  })

  it('preserves external redirects', async () => {
    const original = Response.redirect(
      'https://external.example/page',
      HTTP_REDIRECT
    )
    await expect(
      markdownContent(event({ path: '/en/about.md' }), () =>
        Promise.resolve(original)
      )
    ).resolves.toBe(original)
  })

  it('rejects malformed encoding with a public response', async () => {
    const next = vi.fn<() => Promise<Response>>(() => html())
    const response = await markdownContent(event({ path: '/en/%E0.md' }), next)
    expect(response.status).toBe(HTTP_BAD_REQUEST)
    expect(next).not.toHaveBeenCalled()
  })
})

describe('markdown resource bounds', () => {
  beforeEach(() => {
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
  })
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

  it('bounds conversion input', async () => {
    const response = await markdownContent(event(), () =>
      html('x'.repeat(MAX_HTML_BYTES + 1))
    )
    expect(response.status).toBe(HTTP_SERVER_ERROR)
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
