import { provideRequestEvent } from '@solidjs/web/storage'

import { isPublicError } from '@/infra/server/publicErrors/index.ts'

import middleware, { containFailures, requestMiddleware } from '../index.ts'

const TEST_ORIGIN = 'http://localhost'
const REQUEST_TIMING_INDEX = 0
const SECURITY_HEADERS_INDEX = 1
const REQUEST_CONTEXT_INDEX = 2
const API_HANDLER_INDEX = 3
const HTTP_FOUND = 302
const HTTP_BAD_GATEWAY = 502
const HTTP_INTERNAL_SERVER_ERROR = 500
const PUBLIC_MESSAGE = 'Não foi possível concluir a solicitação.'
const LOG_MESSAGE = '[middleware] Unexpected failure; private details omitted'

type LocalsEvent = {
  request: Request
  locals: { serverFailure?: Error }
  response: { headers: Headers }
}

// Uma cadeia cujo único middleware rejeita com o valor recebido.
function failingWith(value: unknown) {
  const fail = vi.fn<() => Promise<Response>>().mockRejectedValue(value)
  return containFailures([fail])
}

function renderPage() {
  return vi.fn<() => Promise<Response>>().mockResolvedValue(
    new Response('<main>Algo deu errado!</main>', {
      headers: { 'content-type': 'text/html; charset=utf-8' }
    })
  )
}

function pageEvent(path = '/'): LocalsEvent {
  const request = new Request(new URL(path, TEST_ORIGIN), {
    headers: { accept: 'text/html,application/xhtml+xml' }
  })
  return { request, locals: {}, response: { headers: new Headers() } }
}

// Simula um objeto lançado cuja inspeção falha, com o marcador na mensagem.
function hostileValue(): object {
  return new Proxy(
    {},
    {
      getPrototypeOf: () => {
        throw new Error('PRIVATE_PROTOTYPE')
      }
    }
  )
}

describe('contenção de falhas do middleware', () => {
  beforeEach(() => {
    // A contenção só vale nos builds de produção; o Vitest roda com DEV.
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockImplementation(vi.fn())
  })

  it('preserva a resposta do próximo handler sem registrar log', async () => {
    const response = new Response('conteúdo')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)

    await expect(
      containFailures([])(new Request(TEST_ORIGIN), next)
    ).resolves.toBe(response)
    expect(console.error).not.toHaveBeenCalled()
  })

  it.each([
    ['um Error', new Error('PRIVATE', { cause: 'CAUSE_PRIVATE' })],
    [
      'uma Response com corpo',
      new Response('PRIVATE', { status: HTTP_BAD_GATEWAY })
    ],
    ['um objeto cuja inspeção falha', hostileValue()]
  ])('troca %s por 500 público com log fixo', async (_label, failure) => {
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
    expect(console.error).toHaveBeenCalledExactlyOnceWith(LOG_MESSAGE)
  })

  it('responde 500 público mesmo quando o log falha', async () => {
    vi.mocked(console.error).mockImplementationOnce(() => {
      throw new Error('stderr indisponível')
    })

    const response = await failingWith(new Error('PRIVATE'))(
      new Request(TEST_ORIGIN),
      renderPage()
    )

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
  })

  it('deixa passar uma Response de controle sem corpo', async () => {
    const control = Response.redirect(new URL('/', TEST_ORIGIN), HTTP_FOUND)

    await expect(
      failingWith(control)(new Request(TEST_ORIGIN), renderPage())
    ).resolves.toBe(control)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('relança o erro original em desenvolvimento', async () => {
    vi.stubEnv('DEV', true)
    const failure = new Error('PRIVATE')

    await expect(
      failingWith(failure)(new Request(TEST_ORIGIN), renderPage())
    ).rejects.toBe(failure)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('renderiza a página de erro do app numa navegação', async () => {
    const event = pageEvent()
    const render = renderPage()

    const response = await provideRequestEvent(event, () =>
      failingWith(new Error('PRIVATE'))(event.request, render)
    )

    expect(render).toHaveBeenCalledOnce()
    expect(isPublicError(event.locals.serverFailure)).toBe(true)
    await expect(response.text()).resolves.toBe('<main>Algo deu errado!</main>')
    expect({
      status: response.status,
      ...Object.fromEntries(response.headers)
    }).toMatchObject({
      status: HTTP_INTERNAL_SERVER_ERROR,
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff'
    })
    expect(console.error).toHaveBeenCalledExactlyOnceWith(LOG_MESSAGE)
  })

  it('cai no 500 em texto quando a página de erro falha', async () => {
    const event = pageEvent()
    const render = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValue(new Error('PRIVATE_RENDER'))

    const response = await provideRequestEvent(event, () =>
      failingWith(new Error('PRIVATE'))(event.request, render)
    )

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
  })

  it('não renderiza de novo quando a falha vem depois do render', async () => {
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

  it.each(['/_server', '/_server/abc123'])(
    'não renderiza a página de erro em %s, mesmo com accept de HTML',
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

  it('registra um log fixo quando a página de erro falha', async () => {
    const event = pageEvent()
    const render = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValue(new Error('PRIVATE_RENDER'))

    await provideRequestEvent(event, () =>
      failingWith(new Error('PRIVATE'))(event.request, render)
    )

    expect(vi.mocked(console.error).mock.calls).toStrictEqual([
      [LOG_MESSAGE],
      ['[error-page] Unexpected failure; private details omitted']
    ])
  })

  it('não renderiza páginas para métodos que não são de navegação', async () => {
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

  it('compõe a cadeia de produção dentro da contenção', async () => {
    const response = new Response('página')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)
    provideRequestEvent(pageEvent(), vi.fn())

    const request = new Request(new URL('/pagina', TEST_ORIGIN))

    await expect(middleware(request, next)).resolves.toBe(response)
    expect(next).toHaveBeenCalledOnce()
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })
})

describe('middlewares de requisição', () => {
  it('mede o tempo e preserva a resposta do próximo handler', async () => {
    const started = 100
    const finished = 112.5
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(started)
      .mockReturnValueOnce(finished)
    const response = new Response('conteúdo')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)
    const requestTiming = requestMiddleware[REQUEST_TIMING_INDEX]
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
    const securityHeaders = requestMiddleware[SECURITY_HEADERS_INDEX]
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
    const requestContext = requestMiddleware[REQUEST_CONTEXT_INDEX]
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
    const apiHandler = requestMiddleware[API_HANDLER_INDEX]
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
    const requestContext = requestMiddleware[REQUEST_CONTEXT_INDEX]
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
