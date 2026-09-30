import { provideRequestEvent } from '@solidjs/web/storage'

import { readLog } from '@/tests/helpers/readLog/index.ts'

import middleware, { requestMiddleware } from '../index.ts'
import { requestContext } from '../requestContext/index.ts'
import { requestTiming } from '../requestTiming/index.ts'
import { securityHeaders } from '../securityHeaders/index.ts'

const TEST_ORIGIN = 'http://localhost'
const API_HANDLER_INDEX = 3
const HTTP_FOUND = 302
const HTTP_INTERNAL_SERVER_ERROR = 500
const PUBLIC_MESSAGE = 'Não foi possível concluir a solicitação.'
const LOG_MESSAGE = '[middleware] Unexpected failure; private details omitted'

type LocalsEvent = {
  request: Request
  locals: { serverFailure?: Error }
  response: { headers: Headers }
}

function pageEvent(path = '/'): LocalsEvent {
  const request = new Request(new URL(path, TEST_ORIGIN), {
    headers: { accept: 'text/html,application/xhtml+xml' }
  })
  return { request, locals: {}, response: { headers: new Headers() } }
}

describe('export padrão do middleware', () => {
  beforeEach(() => {
    // A contenção só vale nos builds de produção; o Vitest roda com DEV.
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockImplementation(vi.fn())
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

  // O E2E injeta falhas pela fábrica; só este teste prova que o export padrão
  // mantém a contenção.
  it('troca uma falha da cadeia por 500 público', async () => {
    const event: LocalsEvent = {
      request: new Request(TEST_ORIGIN),
      locals: {},
      response: { headers: new Headers() }
    }
    const next = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValue(new Error('PRIVATE'))

    const response = await provideRequestEvent(event, () =>
      middleware(event.request, next)
    )

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    })
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })

  // Response.redirect() chega com headers imutáveis e sem corpo.
  it('grava os headers da cadeia num redirect sem trocar por 500', async () => {
    const event = pageEvent('/pagina')
    const next = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValue(
        Response.redirect(new URL('/destino', TEST_ORIGIN), HTTP_FOUND)
      )

    const response = await provideRequestEvent(event, () =>
      middleware(event.request, next)
    )

    expect(console.error).not.toHaveBeenCalled()
    expect({
      status: response.status,
      ...Object.fromEntries(response.headers)
    }).toMatchObject({
      status: HTTP_FOUND,
      location: `${TEST_ORIGIN}/destino`,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    })
    expect(response.headers.get('server-timing')).toMatch(/^app;dur=/u)
  })

  // O retorno cru de fetch() tem headers imutáveis e corpo upstream; a cadeia
  // não o repassa.
  it('troca a resposta crua de fetch() por 500 público', async () => {
    const event: LocalsEvent = {
      request: new Request(new URL('/pagina', TEST_ORIGIN)),
      locals: {},
      response: { headers: new Headers() }
    }
    const next = vi
      .fn<() => Promise<Response>>()
      .mockReturnValue(fetch('data:text/plain,PRIVATE_UPSTREAM'))

    const response = await provideRequestEvent(event, () =>
      middleware(event.request, next)
    )

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
    // Headers imutáveis lançam um TypeError; o corpo upstream fica fora do log.
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'TypeError']],
      leaks: []
    })
  })
})

describe('cadeia de produção', () => {
  // A ordem define o intervalo medido pelo server-timing e quais respostas
  // recebem os cabeçalhos de segurança; as suítes de cada módulo não a fixam.
  it('mantém a ordem dos middlewares da cadeia', () => {
    expect(requestMiddleware).toStrictEqual([
      requestTiming,
      securityHeaders,
      requestContext,
      expect.any(Function)
    ])
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
})
