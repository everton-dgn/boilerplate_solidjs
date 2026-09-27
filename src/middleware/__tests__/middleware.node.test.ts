import { provideRequestEvent } from '@solidjs/web/storage'

import middleware from '../index.ts'

const TEST_ORIGIN = 'http://localhost'
const REQUEST_CONTEXT_INDEX = 2
const API_HANDLER_INDEX = 3

describe('middlewares de requisição', () => {
  it('mede o tempo e preserva a resposta do próximo handler', async () => {
    const started = 100
    const finished = 112.5
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(started)
      .mockReturnValueOnce(finished)
    const response = new Response('conteúdo')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)
    const [requestTiming] = middleware
    if (!requestTiming) throw new Error('Request timing middleware not found')

    await expect(requestTiming(new Request(TEST_ORIGIN), next)).resolves.toBe(
      response
    )
    expect(response.headers.get('server-timing')).toBe('app;dur=12.5')
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  it('adiciona os cabeçalhos de segurança à resposta', async () => {
    const response = new Response('conteúdo')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)
    const [, securityHeaders] = middleware
    if (!securityHeaders) {
      throw new Error('Security headers middleware not found')
    }

    await expect(securityHeaders(new Request(TEST_ORIGIN), next)).resolves.toBe(
      response
    )
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin'
    )
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  it('disponibiliza um identificador no contexto antes do próximo handler', async () => {
    const requestId = '12345678-1234-4234-8234-123456789abc'
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(requestId)
    const event = {
      request: new Request(TEST_ORIGIN),
      locals: {} as { requestId?: string },
      response: { headers: new Headers() }
    }
    const response = new Response()
    const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      expect(event.locals.requestId).toBe(requestId)
      return Promise.resolve(response)
    })
    const requestContext = middleware[REQUEST_CONTEXT_INDEX]
    if (!requestContext) throw new Error('Request context middleware not found')

    await expect(
      provideRequestEvent(event, () => requestContext(event.request, next))
    ).resolves.toBe(response)
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  // O despacho das rotas de API é do filesystem-routing e a suíte E2E cobre
  // sitemap.xml e robots.txt; aqui só o encadeamento importa.
  it('entrega ao próximo handler as requisições sem rota de API', async () => {
    const response = new Response('página')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)
    const apiHandler = middleware[API_HANDLER_INDEX]
    if (!apiHandler) throw new Error('API handler middleware not found')

    const request = new Request(new URL('/pagina', TEST_ORIGIN))

    await expect(apiHandler(request, next)).resolves.toBe(response)
    expect(next).toHaveBeenCalledOnce()
  })

  it('continua a requisição mesmo sem contexto', async () => {
    // Em produção o servidor instala o armazenamento do contexto antes da
    // primeira requisição. Um escopo vazio faz o mesmo aqui, sem depender da
    // ordem em que os testes rodam.
    provideRequestEvent(
      {
        request: new Request(TEST_ORIGIN),
        locals: {},
        response: { headers: new Headers() }
      },
      vi.fn()
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(vi.fn())
    const response = new Response()
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)
    const requestContext = middleware[REQUEST_CONTEXT_INDEX]
    if (!requestContext) throw new Error('Request context middleware not found')

    await expect(requestContext(new Request(TEST_ORIGIN), next)).resolves.toBe(
      response
    )
    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('RequestEvent is missing.')
    )
  })
})
