import { paraglideMiddleware } from '@paraglide/server.js'
import { createRequestEvent, type RequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'

import { isPublicError } from '@/infra/server/publicErrors/index.ts'
import { hostileValue } from '@/tests/helpers/failureValues/index.ts'
import { readLog } from '@/tests/helpers/readLog/index.ts'

import { containFailures } from '../index.ts'

const TEST_ORIGIN = 'http://localhost'
const HTTP_FOUND = 302
const HTTP_BAD_GATEWAY = 502
const HTTP_INTERNAL_SERVER_ERROR = 500
// Without the paraglide locale context, the message is in the base locale.
const PUBLIC_MESSAGE = 'The request could not be completed.'
const LOG_MESSAGE = '[middleware] Unexpected failure; private details omitted'
const ERROR_PAGE_LOG =
  '[error-page] Unexpected failure; private details omitted'

// A chain whose only middleware rejects with the received value.
function failingWith(value: unknown) {
  const fail = vi.fn<() => Promise<Response>>().mockRejectedValue(value)
  return containFailures([fail])
}

function renderPage() {
  return vi.fn<() => Promise<Response>>().mockResolvedValue(
    new Response('<main>Something went wrong!</main>', {
      headers: { 'content-type': 'text/html; charset=utf-8' }
    })
  )
}

function pageEvent(path = '/'): RequestEvent {
  const request = new Request(new URL(path, TEST_ORIGIN), {
    headers: { accept: 'text/html,application/xhtml+xml' }
  })
  return createRequestEvent(request)
}

// A redirect that passes the control classification, but whose headers fail when
// read: it accepts neither a write nor a copy.
function hostileControl(): Response {
  const control = Response.redirect(new URL('/', TEST_ORIGIN), HTTP_FOUND)
  return new Proxy(control, {
    get: (target, property): unknown => {
      if (property === 'headers') throw new Error('PRIVATE_HEADERS')
      return Reflect.get(target, property, target)
    }
  })
}

function failLog(): never {
  throw new Error('PRIVATE_DESTINATION')
}

function mockProductionLog(): void {
  // The containment and the CSP only apply to production builds; Vitest runs with DEV.
  vi.stubEnv('DEV', false)
  vi.spyOn(console, 'error').mockImplementation(vi.fn())
}

describe('middleware failure containment', () => {
  beforeEach(mockProductionLog)

  it('keeps the response of the next handler without logging', async () => {
    const response = new Response('content')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)

    await expect(
      containFailures([])(new Request(TEST_ORIGIN), next)
    ).resolves.toBe(response)
    expect(console.error).not.toHaveBeenCalled()
  })

  it.each([
    ['an Error', new Error('PRIVATE', { cause: 'CAUSE_PRIVATE' }), ['Error']],
    [
      'a Response with a body',
      new Response('PRIVATE', { status: HTTP_BAD_GATEWAY }),
      []
    ],
    ['an object whose inspection fails', hostileValue(), []],
    ['a Response.error(), with status 0', Response.error(), []],
    ['a control whose headers fail', hostileControl(), []]
  ])(
    'replaces %s with a public 500 and a filtered log',
    async (_label, failure, details) => {
      const render = renderPage()
      const response = await failingWith(failure)(
        new Request(TEST_ORIGIN),
        render
      )

      expect(render).not.toHaveBeenCalled()
      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
      await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
      expect(Object.fromEntries(response.headers)).toMatchObject({
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin'
      })
      expect(readLog(console.error)).toStrictEqual({
        heads: [[LOG_MESSAGE, ...details]],
        leaks: []
      })
    }
  )

  it('answers a public 500 even when the log fails', async () => {
    vi.mocked(console.error).mockImplementationOnce(() => {
      throw new Error('stderr unavailable')
    })

    const response = await failingWith(new Error('PRIVATE'))(
      new Request(TEST_ORIGIN),
      renderPage()
    )

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error'], [LOG_MESSAGE]],
      leaks: []
    })
  })

  it('answers in the locale of the request inside the locale context', async () => {
    const response = await paraglideMiddleware(
      new Request(new URL('/pt', TEST_ORIGIN)),
      () =>
        failingWith(new Error('PRIVATE'))(
          new Request(TEST_ORIGIN),
          renderPage()
        )
    )

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(
      'Não foi possível concluir a solicitação.'
    )
  })

  it('lets through a control Response without a body, with the security headers', async () => {
    const control = Response.redirect(new URL('/', TEST_ORIGIN), HTTP_FOUND)

    const response = await failingWith(control)(
      new Request(TEST_ORIGIN),
      renderPage()
    )

    expect({
      status: response.status,
      ...Object.fromEntries(response.headers)
    }).toMatchObject({
      status: HTTP_FOUND,
      location: `${TEST_ORIGIN}/`,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    })
    expect(console.error).not.toHaveBeenCalled()
  })

  it('rethrows the original error in development', async () => {
    vi.stubEnv('DEV', true)
    const failure = new Error('PRIVATE')

    await expect(
      failingWith(failure)(new Request(TEST_ORIGIN), renderPage())
    ).rejects.toBe(failure)
    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('middleware error page', () => {
  beforeEach(mockProductionLog)

  it('renders the error page of the app on a navigation', async () => {
    const event = pageEvent()
    const render = renderPage()

    const response = await provideRequestEvent(event, () =>
      failingWith(new Error('PRIVATE'))(event.request, render)
    )

    expect(render).toHaveBeenCalledOnce()
    expect(isPublicError(event.locals.serverFailure)).toBe(true)
    await expect(response.text()).resolves.toBe(
      '<main>Something went wrong!</main>'
    )
    expect({
      status: response.status,
      ...Object.fromEntries(response.headers)
    }).toMatchObject({
      status: HTTP_INTERNAL_SERVER_ERROR,
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff'
    })
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })

  it('does not render again when the failure comes after the render', async () => {
    const event = pageEvent()
    const render = renderPage()
    const failAfterRender = vi
      .fn<
        (request: Request, next: () => Promise<Response>) => Promise<Response>
      >()
      .mockImplementation(async (_request, renderNext) => {
        const page = await renderNext()
        throw new Error(`PRIVATE_AFTER_${page.status}`)
      })

    const response = await provideRequestEvent(event, () =>
      containFailures([failAfterRender])(event.request, render)
    )

    expect(render).toHaveBeenCalledOnce()
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
  })

  // With the authored entries there is no boundary outside Document: an exception
  // in it leaves renderToStream synchronously and rejects the render of the chain.
  it('answers a text 500 without rendering again when the render itself throws', async () => {
    const event = pageEvent()
    const render = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValue(new TypeError('PRIVATE_DOCUMENT'))
    const passThrough = vi
      .fn<
        (request: Request, next: () => Promise<Response>) => Promise<Response>
      >()
      .mockImplementation(async (_request, renderNext) => renderNext())

    const response = await provideRequestEvent(event, () =>
      containFailures([passThrough])(event.request, render)
    )

    expect(render).toHaveBeenCalledOnce()
    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
    expect(response.headers.get('content-security-policy')).toContain(
      "script-src 'none'"
    )
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'TypeError']],
      leaks: []
    })
  })

  it.each(['/_server', '/_server/abc123'])(
    'does not render the error page on %s, even with an HTML accept',
    async path => {
      const event = pageEvent(path)
      const render = renderPage()

      const response = await provideRequestEvent(event, () =>
        failingWith(new Error('PRIVATE'))(event.request, render)
      )

      expect(render).not.toHaveBeenCalled()
      await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
    }
  )

  it('falls back to the text 500 and logs the fixed line and the render error when the error page fails', async () => {
    const event = pageEvent()
    const render = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValue(new TypeError('PRIVATE_RENDER'))

    const response = await provideRequestEvent(event, () =>
      failingWith(new Error('PRIVATE'))(event.request, render)
    )

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
    expect(readLog(console.error)).toStrictEqual({
      heads: [
        [LOG_MESSAGE, 'Error'],
        [ERROR_PAGE_LOG, 'TypeError']
      ],
      leaks: []
    })
  })

  it('keeps the public 500 when the error render and both logs fail', async () => {
    const event = pageEvent()
    const render = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValue(new TypeError('PRIVATE_RENDER'))
    vi.mocked(console.error)
      .mockImplementationOnce(failLog)
      .mockImplementationOnce(failLog)
      .mockImplementationOnce(failLog)
      .mockImplementationOnce(failLog)

    const response = await provideRequestEvent(event, () =>
      failingWith(new Error('PRIVATE'))(event.request, render)
    )

    expect(render).toHaveBeenCalledOnce()
    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
    expect(readLog(console.error)).toStrictEqual({
      heads: [
        [LOG_MESSAGE, 'Error'],
        [LOG_MESSAGE],
        [ERROR_PAGE_LOG, 'TypeError'],
        [ERROR_PAGE_LOG]
      ],
      leaks: []
    })
  })

  it('does not render pages for methods that are not navigation methods', async () => {
    const event = pageEvent()
    const request = new Request(TEST_ORIGIN, {
      method: 'POST',
      headers: { accept: 'text/html' }
    })
    const render = renderPage()

    const response = await provideRequestEvent({ ...event, request }, () =>
      failingWith(new Error('PRIVATE'))(request, render)
    )

    expect(render).not.toHaveBeenCalled()
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
  })
})

// The HTML criterion follows the plugin: the requests that get the page when
// nothing fails get the error page.
describe('accept of a navigation', () => {
  beforeEach(mockProductionLog)

  it.each([
    ['with accept */*', { accept: '*/*' }, true],
    ['without accept', {}, true],
    ['with a JSON accept', { accept: 'application/json' }, false]
  ])(
    'decides the error page of a GET %s',
    async (_label, headers, hasErrorPage) => {
      const event = pageEvent()
      const request = new Request(TEST_ORIGIN, { headers })
      const render = renderPage()

      const response = await provideRequestEvent({ ...event, request }, () =>
        failingWith(new Error('PRIVATE'))(request, render)
      )

      expect(render).toHaveBeenCalledTimes(hasErrorPage ? 1 : 0)
      await expect(response.text()).resolves.toBe(
        hasErrorPage ? '<main>Something went wrong!</main>' : PUBLIC_MESSAGE
      )
    }
  )
})

// The containment responses do not go back through securityHeaders; the CSP and
// the nonce are written here.
describe('CSP in the containment responses', () => {
  beforeEach(mockProductionLog)

  it('blocks scripts on the text 500 outside a request', async () => {
    const response = await failingWith(new Error('PRIVATE'))(
      new Request(TEST_ORIGIN),
      renderPage()
    )

    expect(response.headers.get('content-security-policy')).toContain(
      "script-src 'none'"
    )
    expect(response.headers.get('cross-origin-embedder-policy')).toBe(
      'require-corp'
    )
  })

  // A failure before securityHeaders leaves the request without a nonce; the error
  // page needs it in the render so that the scripts match the CSP.
  it('creates the nonce before rendering the error page', async () => {
    const event = pageEvent()
    let seen: unknown
    const render = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      seen = event.nonce
      return Promise.resolve(
        new Response('<main>Something went wrong!</main>', {
          headers: { 'content-type': 'text/html; charset=utf-8' }
        })
      )
    })

    const response = await provideRequestEvent(event, () =>
      failingWith(new Error('PRIVATE'))(event.request, render)
    )

    assert(typeof seen === 'string')
    expect(seen).toMatch(/^[A-Za-z0-9+/]{22}==$/u)
    expect(response.headers.get('content-security-policy')).toContain(
      `script-src 'nonce-${seen}' 'strict-dynamic'`
    )
  })

  it('keeps on the error page the nonce already created in the request', async () => {
    const event = pageEvent()
    event.nonce = 'bm9uY2UtYW50ZXJpb3I='

    const response = await provideRequestEvent(event, () =>
      failingWith(new Error('PRIVATE'))(event.request, renderPage())
    )

    expect(response.headers.get('content-security-policy')).toContain(
      "script-src 'nonce-bm9uY2UtYW50ZXJpb3I=' 'strict-dynamic'"
    )
  })

  it('writes the CSP and the security headers on the thrown control', async () => {
    const event = pageEvent()
    const control = Response.redirect(new URL('/', TEST_ORIGIN), HTTP_FOUND)

    const response = await provideRequestEvent(event, () =>
      failingWith(control)(event.request, renderPage())
    )

    expect(response.status).toBe(HTTP_FOUND)
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'x-frame-options': 'DENY',
      'strict-transport-security': 'max-age=63072000; includeSubDomains'
    })
    // The redirect has no document: the CSP blocks scripts without writing the nonce.
    expect(response.headers.get('content-security-policy')).toContain(
      "script-src 'none'"
    )
  })
})
