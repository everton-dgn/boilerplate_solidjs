import { createRequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'

import { Router } from '@/router.ts'

import middleware from '../../index.ts'

const { apiHandler } = vi.hoisted(() => ({
  apiHandler: vi.fn<() => Response>()
}))
const HTTP_REDIRECT = 307
const HTTP_NOT_FOUND = 404
const HTTP_NOT_ACCEPTABLE = 406
const ORIGIN = 'https://example.com'

type RequestOptions = { path: string; method?: string }

vi.mock(import('filesystem-routing/api'), async importOriginal => {
  const api = await importOriginal()
  const routes = [
    { path: '/robots.txt', $GET: { require: () => ({ GET: apiHandler }) } }
  ]
  return {
    ...api,
    createAPIMatcher: () => api.createAPIMatcher(routes),
    createAPIHandler: () => api.createAPIHandler(routes)
  }
})

function request({ path, method = 'GET' }: RequestOptions) {
  return createRequestEvent(
    new Request(new URL(path, ORIGIN), {
      method,
      headers: { accept: 'application/json', 'accept-language': 'es' }
    })
  )
}

describe('markdown request protocol boundaries', () => {
  beforeEach(() => {
    vi.stubEnv('PROD', false)
    vi.stubEnv('DEV', false)
    apiHandler.mockReturnValue(new Response('API executed'))
    vi.spyOn(Router, 'match').mockReturnValue([
      {
        path: '/',
        pattern: '/',
        match: '/',
        params: {},
        info: { markdown: true }
      }
    ])
  })

  it.each(['GET', 'HEAD'])(
    'localizes %s before returning an unsupported representation',
    async method => {
      const render = vi.fn<() => Promise<Response>>()
      const initial = request({ path: '/', method })
      const redirect = await provideRequestEvent(initial, () =>
        middleware(initial, render)
      )
      expect(redirect.status).toBe(HTTP_REDIRECT)
      expect(redirect.headers.get('location')).toBe(`${ORIGIN}/es`)
      const localized = request({ path: '/es', method })
      const response = await provideRequestEvent(localized, () =>
        middleware(localized, render)
      )
      expect({
        status: response.status,
        ...Object.fromEntries(response.headers)
      }).toMatchObject({
        status: HTTP_NOT_ACCEPTABLE,
        'content-language': 'es',
        'cache-control': 'private, no-store'
      })
      await expect(response.text()).resolves.toBe(
        method === 'HEAD' ? '' : 'text/html\ntext/markdown\n'
      )
      expect(render).not.toHaveBeenCalled()
    }
  )

  it.each(['/robots.txt.md', '/_server.md', '/favicon.ico.md', '/assets.md'])(
    'rejects non-page destination of %s before dispatch',
    async path => {
      vi.spyOn(Router, 'match').mockReturnValue([
        { path: '/*404', pattern: '/*404', match: path, params: {}, info: {} }
      ])
      const event = request({ path })
      event.request.headers.set('accept', 'text/markdown')
      const original = event.request
      const render = vi.fn<() => Promise<Response>>(() =>
        Promise.resolve(new Response('RPC or asset executed'))
      )
      const response = await provideRequestEvent(event, () =>
        middleware(event, render)
      )
      expect(response.status).toBe(HTTP_NOT_FOUND)
      expect(apiHandler).not.toHaveBeenCalled()
      expect(render).not.toHaveBeenCalled()
      expect(event.request).toBe(original)
    }
  )
})
