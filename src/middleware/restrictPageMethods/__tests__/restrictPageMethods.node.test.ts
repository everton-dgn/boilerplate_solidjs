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

describe('métodos aceitos nas páginas', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'responde 405 a %s numa página sem chamar o render',
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
    'responde 405 a %s numa rota de API sem handler para o método',
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
    'responde 405 a %s numa rota de API que só atende POST',
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

  it('lista OPTIONS no Allow quando a rota de API o exporta', async () => {
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
  ])('entrega ao próximo handler: %o', async ({ path, method }) => {
    const original = new Response('próximo')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(original)

    await expect(
      restrictPageMethods(request({ path, method }), next)
    ).resolves.toBe(original)
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })
})
