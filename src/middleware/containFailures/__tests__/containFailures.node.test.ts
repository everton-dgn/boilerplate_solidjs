import { provideRequestEvent } from '@solidjs/web/storage'

import { isPublicError } from '@/infra/server/publicErrors/index.ts'
import { requestTiming } from '@/middleware/requestTiming/index.ts'
import { hostileValue } from '@/tests/helpers/hostileValue/index.ts'
import { readLog } from '@/tests/helpers/readLog/index.ts'

import { containFailures } from '../index.ts'

const TEST_ORIGIN = 'http://localhost'
const HTTP_FOUND = 302
const HTTP_BAD_GATEWAY = 502
const HTTP_INTERNAL_SERVER_ERROR = 500
const PUBLIC_MESSAGE = 'Não foi possível concluir a solicitação.'
const LOG_MESSAGE = '[middleware] Unexpected failure; private details omitted'
const ERROR_PAGE_LOG =
  '[error-page] Unexpected failure; private details omitted'
// Entrada que o runtime grava no Server-Timing com um traceparent amostrado.
const TRACE_TIMING =
  'traceparent;desc="00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"'

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

// Um redirect que passa na classificação de controle, mas cujos headers falham
// ao ser lidos: não aceita gravação nem cópia.
function hostileControl(): Response {
  const control = Response.redirect(new URL('/', TEST_ORIGIN), HTTP_FOUND)
  return new Proxy(control, {
    get: (target, property): unknown => {
      if (property === 'headers') throw new Error('PRIVATE_HEADERS')
      return Reflect.get(target, property, target)
    }
  })
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
    ['um Error', new Error('PRIVATE', { cause: 'CAUSE_PRIVATE' }), ['Error']],
    [
      'uma Response com corpo',
      new Response('PRIVATE', { status: HTTP_BAD_GATEWAY }),
      []
    ],
    ['um objeto cuja inspeção falha', hostileValue(), []],
    ['uma Response.error(), com status 0', Response.error(), []],
    ['um controle cujos headers falham', hostileControl(), []]
  ])(
    'troca %s por 500 público com log filtrado',
    async (_label, failure, details) => {
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
      expect(readLog(console.error)).toStrictEqual({
        heads: [[LOG_MESSAGE, ...details]],
        leaks: []
      })
    }
  )

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

  it('deixa passar uma Response de controle sem corpo, com os headers de segurança', async () => {
    const control = Response.redirect(new URL('/', TEST_ORIGIN), HTTP_FOUND)

    const response = await failingWith(control)(
      new Request(TEST_ORIGIN),
      renderPage()
    )

    expect({
      status: response.status,
      ...Object.fromEntries(response.headers)
    }).toMatchObject({
      status: HTTP_FOUND,
      location: `${TEST_ORIGIN}/`,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    })
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
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
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

  it('registra a linha fixa e o erro do render quando a página de erro falha', async () => {
    const event = pageEvent()
    const render = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValue(new TypeError('PRIVATE_RENDER'))

    await provideRequestEvent(event, () =>
      failingWith(new Error('PRIVATE'))(event.request, render)
    )

    expect(readLog(console.error)).toStrictEqual({
      heads: [
        [LOG_MESSAGE, 'Error'],
        [ERROR_PAGE_LOG, 'TypeError']
      ],
      leaks: []
    })
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
})

// As respostas criadas pela contenção não voltam pelo requestTiming.
describe('server-timing nas respostas da contenção', () => {
  beforeEach(() => {
    // A contenção só vale nos builds de produção; o Vitest roda com DEV.
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockImplementation(vi.fn())
  })

  it('grava o server-timing no controle lançado', async () => {
    const control = Response.redirect(new URL('/', TEST_ORIGIN), HTTP_FOUND)

    const response = await failingWith(control)(
      new Request(TEST_ORIGIN),
      renderPage()
    )

    expect(response.status).toBe(HTTP_FOUND)
    expect(response.headers.get('server-timing')).toMatch(/^app;dur=/u)
  })

  // O requestTiming consome o segundo valor antes da falha: uma medição
  // iniciada no catch daria 7.5.
  it('mede o server-timing do 500 em texto desde a entrada', async () => {
    const started = 100
    const failed = 105
    const finished = 112.5
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(started)
      .mockReturnValueOnce(failed)
      .mockReturnValueOnce(finished)
    const fail = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValue(new Error('PRIVATE'))

    const response = await containFailures([requestTiming, fail])(
      new Request(TEST_ORIGIN),
      renderPage()
    )

    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
    expect(response.headers.get('server-timing')).toBe('app;dur=12.5')
  })

  it('grava o server-timing na página de erro sem apagar o do runtime', async () => {
    const event = pageEvent()
    const render = vi.fn<() => Promise<Response>>().mockResolvedValue(
      new Response('<main>Algo deu errado!</main>', {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'server-timing': TRACE_TIMING
        }
      })
    )

    const response = await provideRequestEvent(event, () =>
      failingWith(new Error('PRIVATE'))(event.request, render)
    )

    await expect(response.text()).resolves.toBe('<main>Algo deu errado!</main>')
    expect(response.headers.get('server-timing')).toMatch(
      /^traceparent;desc="[^"]+", app;dur=/u
    )
  })
})
