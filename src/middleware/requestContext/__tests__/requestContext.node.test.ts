import { provideRequestEvent } from '@solidjs/web/storage'

import { requestContext } from '../index.ts'

const TEST_ORIGIN = 'http://localhost'

describe('contexto da requisição', () => {
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

    await expect(
      provideRequestEvent(event, () => requestContext(event.request, next))
    ).resolves.toBe(response)
    expect(next).toHaveBeenCalledExactlyOnceWith()
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

    await expect(requestContext(new Request(TEST_ORIGIN), next)).resolves.toBe(
      response
    )
    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('RequestEvent is missing.')
    )
  })
})
