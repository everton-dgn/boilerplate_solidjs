import { createRequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'
import { endpoint } from 'virtual:solid-server-function-handler'

import { cookieMaxAge, getLocale } from '@/paraglide/runtime.js'

import { localizeRequest } from '../index.ts'

type PageOptions = {
  path?: string
  headers?: HeadersInit
  responseHeaders?: HeadersInit
  origin?: string
}

const ORIGIN = 'https://example.com'
const HTTP_REDIRECT = 307

function renderPage({
  path = '/',
  headers,
  responseHeaders,
  origin = ORIGIN
}: PageOptions = {}): Promise<Response> {
  const request = new Request(new URL(path, origin), { headers })
  return provideRequestEvent(createRequestEvent(request), () =>
    localizeRequest({
      request,
      next: () =>
        Promise.resolve(new Response(getLocale(), { headers: responseHeaders }))
    })
  )
}

describe('locale negotiation and persistence', () => {
  it.each([
    ['', 'en'],
    ['de-DE', 'en'],
    ['es;q=0, de;q=1', 'en'],
    ['es;q=0.000, pt;q=0', 'en'],
    ['es;q=NaN, pt;q=0.5', 'pt'],
    ['es;q=2, pt;q=0.5', 'pt'],
    ['es;q=-1, pt;q=0.5', 'pt'],
    ['es;q=0.1234, pt;q=0.5', 'pt'],
    ['ES-ar ; Q = 0, pt-BR ; q = 0.4', 'pt'],
    ['pt-BR;q=0.3, es-AR;q=0.8, en;q=0', 'es']
  ])('negotiates %j as %s', async (acceptLanguage, locale) => {
    const response = await renderPage({
      headers: { 'accept-language': acceptLanguage, cookie: 'locale=invalid' }
    })
    expect(response.status).toBe(HTTP_REDIRECT)
    expect(response.headers.get('location')).toBe(`${ORIGIN}/${locale}`)
  })

  it('keeps an explicit URL and cookie ahead of the language header', async () => {
    const headers = {
      cookie: 'locale=es',
      'accept-language': 'pt;q=0, es;q=0, en'
    }
    const page = await renderPage({ path: '/pt', headers })
    await expect(page.text()).resolves.toBe('pt')
    const redirect = await renderPage({ headers })
    expect(redirect.headers.get('location')).toBe(`${ORIGIN}/es`)
  })

  it('persists the negotiated redirect without sharing it through caches', async () => {
    const response = await renderPage({
      path: '/?campaign=example',
      headers: { 'accept-language': 'es-AR' }
    })
    expect(response.headers.get('location')).toBe(
      `${ORIGIN}/es?campaign=example`
    )
    expect(response.headers.getSetCookie()).toStrictEqual([
      `locale=es; Path=/; Max-Age=${cookieMaxAge}; Secure; SameSite=Lax`
    ])
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('vary')).toContain('Cookie')
    expect(response.headers.get('vary')).toContain('Accept-Language')
  })

  it('saves the page locale while retaining other cookies and Vary values', async () => {
    const response = await renderPage({
      path: '/es',
      headers: { cookie: 'locale=pt' },
      responseHeaders: {
        'set-cookie': 'theme=dark; Path=/',
        vary: 'Accept-Encoding',
        'cache-control': 'public, s-maxage=3600'
      }
    })
    expect(response.headers.getSetCookie()).toStrictEqual([
      'theme=dark; Path=/',
      `locale=es; Path=/; Max-Age=${cookieMaxAge}; Secure; SameSite=Lax`
    ])
    expect(response.headers.get('vary')).toBe('Accept-Encoding, Cookie')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('content-language')).toBe('es')
    await expect(response.text()).resolves.toBe('es')
  })

  it('does not rewrite a matching preference and preserves wildcard Vary', async () => {
    const response = await renderPage({
      path: '/es',
      headers: { cookie: 'locale=es' },
      responseHeaders: { vary: '*', 'cache-control': 'private, max-age=60' }
    })
    expect(response.headers.getSetCookie()).toStrictEqual([])
    expect(response.headers.get('vary')).toBe('*')
    expect(response.headers.get('cache-control')).toBe('private, max-age=60')
  })

  it('avoids duplicate Vary fields and permits cookies on local HTTP', async () => {
    const response = await renderPage({
      path: '/en',
      origin: 'http://localhost',
      responseHeaders: { vary: 'accept-encoding, cookie' }
    })
    expect(response.headers.get('vary')).toBe('accept-encoding, cookie')
    expect(response.headers.getSetCookie()).toStrictEqual([
      `locale=en; Path=/; Max-Age=${cookieMaxAge}; SameSite=Lax`
    ])
  })

  it('normalizes server function detection without changing its POST or persisting its locale', async () => {
    const request = new Request(`${ORIGIN}${endpoint}/save`, {
      method: 'POST',
      headers: { 'accept-language': 'es;q=0, de', cookie: 'locale=invalid' },
      body: 'original-body'
    })
    const response = await provideRequestEvent(
      createRequestEvent(request),
      () =>
        localizeRequest({
          request,
          next: async () =>
            new Response(`${getLocale()}:${await request.text()}`)
        })
    )
    await expect(response.text()).resolves.toBe('en:original-body')
    expect(request.headers.get('accept-language')).toBe('es;q=0, de')
    expect(response.headers.getSetCookie()).toStrictEqual([])
  })
})
