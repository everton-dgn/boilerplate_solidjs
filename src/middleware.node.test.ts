import { provideRequestEvent } from '@solidjs/web/storage'

import middleware from './middleware.ts'

const REQUEST_CONTEXT_INDEX = 2

describe('middlewares de requisição', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

    await expect(
      requestTiming(new Request('http://localhost'), next)
    ).resolves.toBe(response)
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

    await expect(
      securityHeaders(new Request('http://localhost'), next)
    ).resolves.toBe(response)
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
      request: new Request('http://localhost'),
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

  it('continua a requisição mesmo sem contexto', async () => {
    const response = new Response()
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)
    const requestContext = middleware[REQUEST_CONTEXT_INDEX]
    if (!requestContext) throw new Error('Request context middleware not found')

    await expect(
      requestContext(new Request('http://localhost'), next)
    ).resolves.toBe(response)
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })
})
