import { endpoint } from 'virtual:solid-server-function-handler'

import { restrictPageMethods } from '../index.ts'

vi.mock(import('filesystem-routing/api'), async importOriginal => {
  const api = await importOriginal()
  return {
    ...api,
    createAPIMatcher: routes =>
      api.createAPIMatcher([
        ...routes,
        {
          path: '/api/write',
          $POST: { require: () => ({ POST: () => new Response('written') }) }
        },
        {
          path: '/sitemap.xml',
          $GET: { require: () => ({ GET: () => new Response('sitemap') }) },
          $HEAD: { require: () => ({ GET: () => new Response('sitemap') }) }
        },
        {
          path: '/api/preflight',
          $GET: { require: () => ({ GET: () => new Response('read') }) },
          $OPTIONS: {
            require: () => ({ OPTIONS: () => new Response(null) })
          }
        }
      ])
  }
})

const ORIGIN = 'https://example.com'
const HTTP_METHOD_NOT_ALLOWED = 405

type MethodRequest = { path: string; method: string }

function request({ path, method }: MethodRequest): Request {
  return new Request(new URL(path, ORIGIN), { method })
}

describe('methods accepted on the pages', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'answers 405 to %s on a page without calling the render',
    async method => {
      const next = vi.fn<() => Promise<Response>>()

      const response = await restrictPageMethods(
        request({ path: '/pt/about', method }),
        next
      )

      expect(next).not.toHaveBeenCalled()
      expect(response.status).toBe(HTTP_METHOD_NOT_ALLOWED)
      expect(response.headers.get('allow')).toBe('GET, HEAD')
      expect(response.body).toBeNull()
    }
  )

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'answers 405 to %s on an API route without a handler for the method',
    async method => {
      const next = vi.fn<() => Promise<Response>>()

      const response = await restrictPageMethods(
        request({ path: '/sitemap.xml', method }),
        next
      )

      expect(next).not.toHaveBeenCalled()
      expect(response.status).toBe(HTTP_METHOD_NOT_ALLOWED)
      expect(response.headers.get('allow')).toBe('GET, HEAD')
      expect(response.body).toBeNull()
    }
  )

  it.each(['GET', 'HEAD'])(
    'answers 405 to %s on an API route that only serves POST',
    async method => {
      const next = vi.fn<() => Promise<Response>>()

      const response = await restrictPageMethods(
        request({ path: '/api/write', method }),
        next
      )

      expect(next).not.toHaveBeenCalled()
      expect(response.status).toBe(HTTP_METHOD_NOT_ALLOWED)
      expect(response.headers.get('allow')).toBe('POST')
    }
  )

  it('lists OPTIONS in Allow when the API route exports it', async () => {
    const next = vi.fn<() => Promise<Response>>()

    const response = await restrictPageMethods(
      request({ path: '/api/preflight', method: 'POST' }),
      next
    )

    expect(next).not.toHaveBeenCalled()
    expect(response.status).toBe(HTTP_METHOD_NOT_ALLOWED)
    expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS')
  })

  it.each([
    { path: '/pt/about', method: 'GET' },
    { path: '/pt/about', method: 'HEAD' },
    { path: `${endpoint}/save`, method: 'POST' },
    { path: endpoint, method: 'POST' },
    { path: '/assets/app.js', method: 'POST' }
  ])('hands to the next handler: %o', async ({ path, method }) => {
    const original = new Response('next')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(original)

    await expect(
      restrictPageMethods(request({ path, method }), next)
    ).resolves.toBe(original)
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })
})
