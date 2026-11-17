import { getLocale } from '@paraglide/runtime.js'
import { createRequestEvent, type RequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'

import { isPublicError } from '@/infra/server/publicErrors/index.ts'
import { Router } from '@/router.ts'
import { readLog } from '@/tests/helpers/readLog/index.ts'

import middleware, { createMiddleware } from '../index.ts'
import { localizeRequest } from '../localizeRequest/index.ts'
import { MAX_HTML_BYTES } from '../markdownContent/constants.ts'

const TEST_ORIGIN = 'http://localhost'
// vi.mock is hoisted to the top of the file; the path goes up with it.
const { API_PATH, FORM_PATH } = vi.hoisted(() => ({
  API_PATH: '/rota-api',
  FORM_PATH: '/formulario'
}))
const HTTP_FOUND = 302
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_INTERNAL_SERVER_ERROR = 500
// The inner chain answers in the locale of the page. The outer containments and
// the Markdown adapter, outside the locale context, answer in the base locale.
const PUBLIC_MESSAGE_PT = 'Não foi possível concluir a solicitação.'
const PUBLIC_MESSAGE_EN = 'The request could not be completed.'
const LOG_MESSAGE = '[middleware] Unexpected failure; private details omitted'
const ERROR_PAGE_LOG =
  '[error-page] Unexpected failure; private details omitted'

vi.mock(import('../localizeRequest/index.ts'), { spy: true })

// The node project uses an empty manifest. The real API handler gets here a
// synthetic route that answers without calling next, like sitemap.xml and
// robots.txt, and a page that also handles POST.
vi.mock(import('filesystem-routing/api'), async importOriginal => {
  const api = await importOriginal()
  const formRoute = {
    path: FORM_PATH,
    page: true,
    $component: {},
    $POST: { require: () => ({ POST: () => new Response('post') }) }
  }
  return {
    ...api,
    createAPIMatcher: () =>
      api.createAPIMatcher([
        {
          path: API_PATH,
          $GET: { require: () => ({ GET: () => new Response('api') }) }
        },
        formRoute
      ]),
    createAPIHandler: () =>
      api.createAPIHandler([
        {
          path: API_PATH,
          $GET: {
            require: () => ({
              GET: () =>
                new Response('api', {
                  headers: { 'content-type': 'text/plain; charset=utf-8' }
                })
            })
          }
        },
        formRoute
      ])
  }
})

function writeEvent(path: string): RequestEvent {
  return createRequestEvent(
    new Request(new URL(path, TEST_ORIGIN), {
      method: 'POST',
      headers: {
        accept: 'text/html',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: 'campo=1'
    })
  )
}

function pageEvent(path = '/pt'): RequestEvent {
  const request = new Request(new URL(path, TEST_ORIGIN), {
    headers: { accept: 'text/html,application/xhtml+xml' }
  })
  return createRequestEvent(request)
}

function mockProductionLog(): void {
  // The containment only applies to production builds; Vitest runs with DEV.
  vi.stubEnv('DEV', false)
  vi.spyOn(console, 'error').mockImplementation(vi.fn())
}

describe('default export of the middleware', () => {
  beforeEach(mockProductionLog)

  it('composes the production chain inside the containment', async () => {
    const response = new Response('page')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)
    const event = pageEvent('/pt/pagina')

    await expect(
      provideRequestEvent(event, () => middleware(event, next))
    ).resolves.toBe(response)
    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  // The E2E tests inject failures through the factory; only this test proves that
  // the default export keeps the containment.
  it('replaces a chain failure with a public 500', async () => {
    const event = pageEvent()
    const next = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValue(new Error('PRIVATE'))

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE_PT)
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    })
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })
})

describe('containment of the Markdown adapter', () => {
  beforeEach(mockProductionLog)

  it.each(['pt', 'en', 'es'])(
    'contains a Markdown matching failure before the render in the %s locale',
    async locale => {
      vi.spyOn(Router, 'match').mockImplementation(() => {
        throw new Error('PRIVATE_MATCH', { cause: 'PRIVATE_CAUSE' })
      })
      const event = pageEvent(`/${locale}/about`)
      const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
        expect(isPublicError(event.locals.serverFailure)).toBe(true)
        return Promise.resolve(
          new Response(getLocale(), {
            headers: { 'content-type': 'text/html' }
          })
        )
      })

      const response = await provideRequestEvent(event, () =>
        middleware(event, next)
      )

      expect(next).toHaveBeenCalledExactlyOnceWith()
      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
      await expect(response.text()).resolves.toBe(locale)
      expect(Object.fromEntries(response.headers)).toMatchObject({
        'content-language': locale,
        'x-content-type-options': 'nosniff'
      })
      expect(readLog(console.error)).toStrictEqual({
        heads: [[LOG_MESSAGE, 'Error']],
        leaks: []
      })
    }
  )

  it('contains a localization failure of the fallback before the matching', async () => {
    vi.spyOn(Router, 'match').mockImplementation(() => {
      throw new Error('PRIVATE_MATCH')
    })
    vi.mocked(localizeRequest).mockRejectedValueOnce(
      new Error('PRIVATE_LOCALE')
    )
    const event = pageEvent('/pt/about')
    const next = vi.fn<() => Promise<Response>>()

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).not.toHaveBeenCalled()
    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE_EN)
    expect(readLog(console.error)).toStrictEqual({
      heads: [
        [LOG_MESSAGE, 'Error'],
        [ERROR_PAGE_LOG, 'Error']
      ],
      leaks: []
    })
  })

  it('contains a Markdown Vary failure without repeating the render', async () => {
    vi.spyOn(Router, 'match').mockReturnValue([
      {
        path: '/about',
        pattern: '/about',
        match: '/about',
        params: {},
        info: { markdown: true }
      }
    ])
    const event = pageEvent('/en/about')
    const page = new Response('PRIVATE_RENDERED_BODY', {
      headers: { 'content-type': 'text/html' }
    })
    const setHeader = page.headers.set.bind(page.headers)
    vi.spyOn(page.headers, 'set').mockImplementation((name, value) => {
      if (name === 'vary' && value.includes('Accept')) {
        throw new Error('PRIVATE_VARY', { cause: 'PRIVATE_CAUSE' })
      }
      setHeader(name, value)
    })
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(page)

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE_EN)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })

  it('keeps the locale during the render of the inner fallback', async () => {
    const event = pageEvent('/en/about')
    const fail = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValue(new Error('PRIVATE_MIDDLEWARE'))
    const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      expect(isPublicError(event.locals.serverFailure)).toBe(true)
      return Promise.resolve(
        new Response(getLocale(), { headers: { 'content-type': 'text/html' } })
      )
    })

    const response = await provideRequestEvent(event, () =>
      createMiddleware([fail])(event, next)
    )

    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    expect(response.headers.get('content-language')).toBe('en')
    await expect(response.text()).resolves.toBe('en')
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })

  it('hands the rewritten alias to the render inside the locale of the page', async () => {
    vi.spyOn(Router, 'match').mockReturnValue([
      {
        path: '/about',
        pattern: '/about',
        match: '/about',
        params: {},
        info: { markdown: true }
      }
    ])
    const event = pageEvent('/en/about.md?version=2')
    event.request = new Request(event.request, {
      headers: { accept: 'text/markdown' }
    })
    const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      expect(event.request.url).toBe(`${TEST_ORIGIN}/en/about?version=2`)
      expect(event.request.headers.get('accept')).toBe('text/html')
      expect(getLocale()).toBe('en')
      event.locals.ssrRenderState = { hasCompleted: true, hasErrors: false }
      return Promise.resolve(
        new Response('<main><h1>Public content</h1></main>', {
          headers: { 'content-type': 'text/html' }
        })
      )
    })

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(response.headers.get('content-language')).toBe('en')
    expect(response.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    )
    await expect(response.text()).resolves.toContain('# Public content')
    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('failures of the Markdown adapter itself', () => {
  beforeEach(mockProductionLog)

  // Without a locale prefix, the fallback returns the redirect instead of the page.
  it('replaces the locale redirect of the fallback with a text 500', async () => {
    vi.spyOn(Router, 'match').mockImplementation(() => {
      throw new Error('PRIVATE_MATCH')
    })
    const event = pageEvent('/about')
    const next = vi.fn<() => Promise<Response>>()

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).not.toHaveBeenCalled()
    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE_EN)
    expect(response.headers.has('location')).toBe(false)
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })

  it('logs the conversion failure above the byte limit', async () => {
    vi.spyOn(Router, 'match').mockReturnValue([
      {
        path: '/about',
        pattern: '/about',
        match: '/about',
        params: {},
        info: { markdown: true }
      }
    ])
    const event = pageEvent('/en/about.md')
    event.request = new Request(event.request, {
      headers: { accept: 'text/markdown' }
    })
    const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      event.locals.ssrRenderState = { hasCompleted: true, hasErrors: false }
      return Promise.resolve(
        new Response('x'.repeat(MAX_HTML_BYTES + 1), {
          headers: { 'content-type': 'text/html' }
        })
      )
    })

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE_EN)
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })
})

describe('responses with immutable headers', () => {
  beforeEach(mockProductionLog)

  // Response.redirect() arrives with immutable headers and without a body.
  it('writes the chain headers on a redirect without replacing it with a 500', async () => {
    const event = pageEvent('/pt/pagina')
    const next = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValue(
        Response.redirect(new URL('/destino', TEST_ORIGIN), HTTP_FOUND)
      )

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(console.error).not.toHaveBeenCalled()
    expect({
      status: response.status,
      ...Object.fromEntries(response.headers)
    }).toMatchObject({
      status: HTTP_FOUND,
      location: `${TEST_ORIGIN}/destino`,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    })
  })

  // The raw return of fetch() has immutable headers and an upstream body; the
  // chain does not pass it along.
  it('replaces the raw fetch() response with a public 500', async () => {
    const event = pageEvent('/pt/pagina')
    const next = vi
      .fn<() => Promise<Response>>()
      .mockReturnValue(fetch('data:text/plain,PRIVATE_UPSTREAM'))

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE_PT)
    // Immutable headers throw a TypeError; the upstream body stays out of the log.
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'TypeError']],
      leaks: []
    })
  })
})

describe('production chain', () => {
  beforeEach(() => {
    // The CSP only goes out in production builds; Vitest runs with DEV.
    vi.stubEnv('DEV', false)
  })

  // The order decides which responses get the security headers and the nonce:
  // the API handler answers without calling next, so what comes after it does
  // not run on the API routes. Changing the order makes this test fail.
  it('applies the headers and the nonce before the API handler', async () => {
    const event = pageEvent(API_PATH)
    const next = vi.fn<() => Promise<Response>>()

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).not.toHaveBeenCalled()
    await expect(response.text()).resolves.toBe('api')
    expect({
      nonce: typeof event.nonce,
      nosniff: response.headers.get('x-content-type-options')
    }).toStrictEqual({
      nonce: 'string',
      nosniff: 'nosniff'
    })
    expect(response.headers.get('content-security-policy')).toContain(
      "script-src 'none'"
    )
  })

  // Dispatching the API routes belongs to filesystem-routing and the E2E suite
  // covers sitemap.xml and robots.txt; here only the chaining matters.
  it('hands the requests without an API route to the next handler', async () => {
    const event = pageEvent('/pt/pagina')
    const response = new Response('page')
    const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      expect(event.nonce).toBeDefined()
      return Promise.resolve(response)
    })

    await expect(
      provideRequestEvent(event, () => middleware(event, next))
    ).resolves.toBe(response)
    expect(next).toHaveBeenCalledOnce()
  })

  // The plugin handler would render the page with any method, in the base locale
  // and with status 200.
  it('answers 405 to a POST on a page without calling the render', async () => {
    const event = writeEvent('/pt/about')
    const next = vi.fn<() => Promise<Response>>()

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).not.toHaveBeenCalled()
    expect(response.status).toBe(HTTP_METHOD_NOT_ALLOWED)
    expect(response.headers.get('allow')).toBe('GET, HEAD')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toContain(
      "script-src 'none'"
    )
  })

  it('keeps the POST of a page handled by the API handler', async () => {
    const event = writeEvent(FORM_PATH)
    const next = vi.fn<() => Promise<Response>>()

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).not.toHaveBeenCalled()
    await expect(response.text()).resolves.toBe('post')
  })

  it('hands the POST of a server function to the dispatcher', async () => {
    const event = writeEvent('/_server/acao')
    const response = new Response('rpc')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)

    await expect(
      provideRequestEvent(event, () => middleware(event, next))
    ).resolves.toBe(response)
    expect(next).toHaveBeenCalledOnce()
  })
})
