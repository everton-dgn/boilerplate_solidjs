import { endpoint } from 'virtual:solid-server-function-handler'

import { restrictPageMethods } from '../index.ts'

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
