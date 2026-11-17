import { createRequire } from 'node:module'

import { createRequestEvent, type RequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'

import { applySecurityHeaders, securityHeaders } from '../index.ts'

const TEST_ORIGIN = 'http://localhost'
const HTTP_FOUND = 302
const NONCE = 'bm9uY2UtZGUtdGVzdGU='
const HTML_HEADERS = { 'content-type': 'text/html; charset=utf-8' }

const EXPECTED_HEADERS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'same-origin'
}

// applySecurityHeaders reads the nonce from the request event.
function applyInRequest(response: Response): Response {
  const event: RequestEvent = createRequestEvent(new Request(TEST_ORIGIN))
  event.nonce = NONCE
  return provideRequestEvent(event, () => applySecurityHeaders(response))
}

// CSP directives by name, without depending on the order.
function directives(response: Response): Record<string, string> {
  const policy = response.headers.get('content-security-policy') ?? ''
  return Object.fromEntries(
    policy.split('; ').map(directive => {
      const [name = '', ...values] = directive.split(' ')
      return [name, values.join(' ')]
    })
  )
}

describe('response security headers', () => {
  beforeEach(() => {
    // The CSP only goes out in production builds; Vitest runs with DEV.
    vi.stubEnv('DEV', false)
  })

  it('writes the security headers', () => {
    const response = applyInRequest(new Response('content'))

    expect(Object.fromEntries(response.headers)).toMatchObject(EXPECTED_HEADERS)
  })

  it('builds the CSP with the nonce and strict-dynamic, without unsafe-inline in scripts and styles', () => {
    const response = applyInRequest(
      new Response('<main>content</main>', { headers: HTML_HEADERS })
    )

    expect(directives(response)).toStrictEqual({
      'default-src': "'self'",
      'script-src': `'nonce-${NONCE}' 'strict-dynamic'`,
      'style-src': "'self'",
      'object-src': "'none'",
      'base-uri': "'self'",
      'form-action': "'self'",
      'frame-ancestors': "'none'"
    })
  })

  it('blocks every script when the script nonce is disabled', () => {
    const event: RequestEvent = createRequestEvent(new Request(TEST_ORIGIN))
    event.nonce = { script: false, style: false }

    const response = provideRequestEvent(event, () =>
      applySecurityHeaders(
        new Response('<main>content</main>', { headers: HTML_HEADERS })
      )
    )

    expect(directives(response)['script-src']).toBe("'none'")
  })

  // sitemap.xml, robots.txt and llms.txt have s-maxage: a nonce in the CSP would
  // stay in the shared cache.
  it.each([
    'text/plain; charset=utf-8',
    'application/xml; charset=utf-8',
    'text/markdown; charset=utf-8',
    'application/json',
    'text/html-sandboxed',
    'application/json; profile=text/html'
  ])('blocks scripts in a %s response even with a nonce', contentType => {
    const response = applyInRequest(
      new Response('content', { headers: { 'content-type': contentType } })
    )

    expect(directives(response)['script-src']).toBe("'none'")
    expect(response.headers.get('content-security-policy')).not.toContain(NONCE)
  })

  it('recognizes the HTML content-type case-insensitively', () => {
    const response = applyInRequest(
      new Response('<main>content</main>', {
        headers: { 'content-type': 'Text/HTML; charset=UTF-8' }
      })
    )

    expect(directives(response)['script-src']).toBe(
      `'nonce-${NONCE}' 'strict-dynamic'`
    )
  })

  it('leaves out the CSP in development and keeps the other headers', () => {
    vi.stubEnv('DEV', true)

    const response = applyInRequest(new Response('content'))

    expect(response.headers.has('content-security-policy')).toBe(false)
    expect(Object.fromEntries(response.headers)).toMatchObject(EXPECTED_HEADERS)
  })

  // Response.redirect() arrives with immutable headers and without a body.
  // Without a document, the redirect runs no scripts.
  it('writes the headers and the CSP on a copy of a redirect', () => {
    const response = applyInRequest(
      Response.redirect(new URL('/destino', TEST_ORIGIN), HTTP_FOUND)
    )

    expect({
      status: response.status,
      location: response.headers.get('location'),
      ...Object.fromEntries(response.headers)
    }).toMatchObject({
      status: HTTP_FOUND,
      location: `${TEST_ORIGIN}/destino`,
      ...EXPECTED_HEADERS
    })
    expect(directives(response)['script-src']).toBe("'none'")
  })

  it('keeps the redirect status when the Node adapter builds the body', async () => {
    const require = createRequire(import.meta.url)
    const adapterPath = require.resolve('srvx/node', {
      paths: [require.resolve('nitro')]
    })
    const adapter: unknown = await import(adapterPath)
    assert(typeof adapter === 'object' && adapter !== null)
    assert(
      'NodeResponse' in adapter && typeof adapter.NodeResponse === 'function'
    )
    const redirect = Response.redirect(
      new URL('/destino', TEST_ORIGIN),
      HTTP_FOUND
    )

    vi.stubGlobal('Response', adapter.NodeResponse)
    try {
      const response = applyInRequest(redirect)

      expect(response.body).toBeNull()
      expect(response.status).toBe(HTTP_FOUND)
      expect(response.headers.get('location')).toBe(`${TEST_ORIGIN}/destino`)
      expect(Object.fromEntries(response.headers)).toMatchObject(
        EXPECTED_HEADERS
      )
      expect(directives(response)['script-src']).toBe("'none'")
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('security headers', () => {
  beforeEach(() => {
    // The CSP only goes out in production builds; Vitest runs with DEV.
    vi.stubEnv('DEV', false)
  })

  it('adds the security headers to the response', async () => {
    const response = new Response('content')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)

    await expect(securityHeaders(new Request(TEST_ORIGIN), next)).resolves.toBe(
      response
    )
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin'
    )
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  // The render reads the nonce from the event; it must exist when next() runs.
  it('creates the nonce before the render and uses it in the CSP', async () => {
    const event: RequestEvent = createRequestEvent(new Request(TEST_ORIGIN))
    let seen: unknown
    const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      seen = event.nonce
      return Promise.resolve(
        new Response('<main>page</main>', {
          headers: { 'content-type': 'text/html; charset=utf-8' }
        })
      )
    })

    const response = await provideRequestEvent(event, () =>
      securityHeaders(event.request, next)
    )

    assert(typeof seen === 'string')
    expect(response.headers.get('content-security-policy')).toContain(
      `script-src 'nonce-${seen}' 'strict-dynamic'`
    )
  })
})
