import {
  createComponent,
  createRequestEvent,
  type RequestEvent,
  renderToStream,
  ssr
} from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'
import { createMemo, Loading, onCleanup } from 'solid-js'

import { readLog } from '@/tests/helpers/readLog/index.ts'

import { containFailures } from '../index.ts'

type PageRequest = { client: AbortController; event: RequestEvent }
type NativeRender = {
  cleanup: () => void
  complete: () => void
  render: () => Promise<Response>
  started: PromiseWithResolvers<undefined>
}

const TEST_ORIGIN = 'http://localhost'
const HTTP_FOUND = 302
const HTTP_INTERNAL_SERVER_ERROR = 500
const PUBLIC_MESSAGE = 'The request could not be completed.'
const LOG_MESSAGE = '[middleware] Unexpected failure; private details omitted'
const ERROR_PAGE_LOG =
  '[error-page] Unexpected failure; private details omitted'
const CANCELLATIONS: [string, unknown][] = [
  ['a desconexão sem motivo informado', undefined],
  ['a desconexão com motivo próprio', new Error('PRIVATE_CLIENT')],
  ['o prazo da publicação', new Error('PRIVATE_DEADLINE')],
  ['um motivo que não é Error', { quiet: true }],
  ['null', null],
  ['false', false],
  ['zero', 0],
  ['string vazia', ''],
  ['NaN', Number.NaN],
  ['zero negativo', -0]
]

function pageRequest(): PageRequest {
  const client = new AbortController()
  const request = new Request(TEST_ORIGIN, {
    signal: client.signal,
    headers: { accept: 'text/html' }
  })
  return { client, event: createRequestEvent(request) }
}

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

function pendingPage(cleanup: () => void) {
  onCleanup(cleanup)
  return ssr(
    ['<main>', '</main>'],
    createComponent(Loading, {
      fallback: 'Waiting',
      get children() {
        const value = createMemo(() => Promise.withResolvers<string>().promise)
        return ssr(
          ['<p>', '</p>'],
          createMemo(() => value())
        )
      }
    })
  )
}

// O render do plugin no modo async aguarda o thenable do renderToStream.
function nativeRender(event: RequestEvent): NativeRender {
  const cleanup = vi.fn<() => void>()
  const complete = vi.fn<() => void>()
  const started = Promise.withResolvers<undefined>()
  const render = vi
    .fn<() => Promise<Response>>()
    .mockImplementation(async () => {
      const rendered = renderToStream(() => pendingPage(cleanup), {
        signal: event.request.signal,
        onCompleteAll: complete
      })
      started.resolve(void 0)
      return new Response(await rendered, {
        headers: { 'content-type': 'text/html' }
      })
    })
  return { cleanup, complete, render, started }
}

function mockProductionLog(): void {
  vi.stubEnv('DEV', false)
  vi.spyOn(console, 'error').mockImplementation(vi.fn())
}

describe('cancelamento esperado da requisição', () => {
  beforeEach(mockProductionLog)

  it.each(CANCELLATIONS)(
    'responde o 500 público sem log nem página de erro em %s',
    async (_label, reason) => {
      const { client, event } = pageRequest()
      client.abort(reason)
      const render = renderPage()

      const response = await provideRequestEvent(event, () =>
        failingWith(event.request.signal.reason)(event.request, render)
      )

      expect(render).not.toHaveBeenCalled()
      expect({
        status: response.status,
        text: await response.text()
      }).toStrictEqual({
        status: HTTP_INTERNAL_SERVER_ERROR,
        text: PUBLIC_MESSAGE
      })
      expect(Object.fromEntries(response.headers)).toMatchObject({
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff'
      })
      expect(response.headers.get('content-security-policy')).toContain(
        "script-src 'none'"
      )
      expect(console.error).not.toHaveBeenCalled()
    }
  )

  it.each(CANCELLATIONS)(
    'não registra o abandono do SSR nativo em %s',
    async (_label, reason) => {
      const { client, event } = pageRequest()
      const { cleanup, complete, render, started } = nativeRender(event)
      const pending = provideRequestEvent(event, () =>
        containFailures([])(event.request, render)
      )
      await started.promise

      client.abort(reason)
      const response = await pending

      expect(render).toHaveBeenCalledOnce()
      expect(cleanup).toHaveBeenCalledOnce()
      expect(complete).not.toHaveBeenCalled()
      expect({
        status: response.status,
        text: await response.text()
      }).toStrictEqual({
        status: HTTP_INTERNAL_SERVER_ERROR,
        text: PUBLIC_MESSAGE
      })
      expect(console.error).not.toHaveBeenCalled()
    }
  )

  it('preserva a Response de controle lançada durante o cancelamento', async () => {
    const { client, event } = pageRequest()
    client.abort()
    const control = Response.redirect(new URL('/', TEST_ORIGIN), HTTP_FOUND)

    const response = await provideRequestEvent(event, () =>
      failingWith(control)(event.request, renderPage())
    )

    expect(response.status).toBe(HTTP_FOUND)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(console.error).not.toHaveBeenCalled()
  })

  it('relança o cancelamento em desenvolvimento', async () => {
    vi.stubEnv('DEV', true)
    const { client, event } = pageRequest()
    client.abort()
    const reason: unknown = event.request.signal.reason

    await expect(failingWith(reason)(event.request, renderPage())).rejects.toBe(
      reason
    )
    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('falha real junto do cancelamento', () => {
  beforeEach(mockProductionLog)

  it.each([
    ['um erro comum', () => new TypeError('PRIVATE'), 'TypeError'],
    [
      'um AbortError de outro sinal',
      () => new DOMException('PRIVATE', 'AbortError'),
      'DOMException'
    ],
    [
      'um erro que só envolve o motivo',
      (reason: unknown) => new Error('PRIVATE', { cause: reason }),
      'Error'
    ]
  ])(
    'registra %s lançado com o sinal abortado',
    async (_label, createFailure, className) => {
      const { client, event } = pageRequest()
      client.abort(new Error('PRIVATE_CLIENT'))
      const failure = createFailure(event.request.signal.reason)

      const response = await provideRequestEvent(event, () =>
        failingWith(failure)(event.request, renderPage())
      )

      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
      expect(readLog(console.error)).toStrictEqual({
        heads: [[LOG_MESSAGE, className]],
        leaks: []
      })
    }
  )

  // Sem o sinal abortado, o motivo é undefined: um undefined lançado não é
  // cancelamento, embora seja idêntico a ele.
  it('registra um undefined lançado com o sinal ativo', async () => {
    const { event } = pageRequest()

    const response = await provideRequestEvent(event, () =>
      failingWith(event.request.signal.reason)(event.request, renderPage())
    )

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE]],
      leaks: []
    })
  })

  it.each([
    ['antes da página de erro', true],
    ['durante a página de erro', false]
  ])(
    'mantém só o log da falha original com o cancelamento %s',
    async (_label, shouldAbortFirst) => {
      const { client, event } = pageRequest()
      const { render, started } = nativeRender(event)
      const reason = new Error('PRIVATE_CLIENT')
      if (shouldAbortFirst) client.abort(reason)

      const pending = provideRequestEvent(event, () =>
        failingWith(new TypeError('PRIVATE'))(event.request, render)
      )
      await started.promise
      client.abort(reason)
      const response = await pending

      expect(render).toHaveBeenCalledOnce()
      expect({
        status: response.status,
        text: await response.text()
      }).toStrictEqual({
        status: HTTP_INTERNAL_SERVER_ERROR,
        text: PUBLIC_MESSAGE
      })
      expect(readLog(console.error)).toStrictEqual({
        heads: [[LOG_MESSAGE, 'TypeError']],
        leaks: []
      })
    }
  )

  it('registra o erro distinto do render de erro cancelado', async () => {
    const { client, event } = pageRequest()
    const render = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      client.abort(new Error('PRIVATE_CLIENT'))
      return Promise.reject(new RangeError('PRIVATE_RENDER'))
    })

    const response = await provideRequestEvent(event, () =>
      failingWith(new TypeError('PRIVATE'))(event.request, render)
    )

    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
    expect(readLog(console.error)).toStrictEqual({
      heads: [
        [LOG_MESSAGE, 'TypeError'],
        [ERROR_PAGE_LOG, 'RangeError']
      ],
      leaks: []
    })
  })
})
