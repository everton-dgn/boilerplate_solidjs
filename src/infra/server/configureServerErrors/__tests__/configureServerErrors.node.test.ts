import {
  configureServerErrors,
  redirect,
  respond,
  type ServerErrorHook
} from '@solidjs/web'
import {
  configureServerFunctionsServer,
  type WrapInvocationHook
} from '@solidjs/web/server-functions/server'
import { NotReadyError } from 'solid-js'

import type {
  createPublicError,
  isPublicError
} from '@/infra/server/publicErrors/index.ts'
import { readLog } from '@/tests/helpers/readLog/index.ts'

vi.mock(import('@solidjs/web'), async importOriginal => ({
  ...(await importOriginal()),
  configureServerErrors: vi.fn<typeof configureServerErrors>()
}))
vi.mock(import('@solidjs/web/server-functions/server'), () => ({
  configureServerFunctionsServer: vi.fn<typeof configureServerFunctionsServer>()
}))

const PUBLIC_MESSAGE = 'Não foi possível concluir a solicitação.'
const LOG_MESSAGE = '[server-error] Unexpected failure; private details omitted'

type PublicErrors = {
  createPublicError: typeof createPublicError
  isPublicError: typeof isPublicError
}

// O wrapper ignora o contexto da invocação; o registro só precisa de run.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ServerFunctionEvent não é construível fora do runtime do Solid.
const context = {} as Parameters<WrapInvocationHook>[1]
// O hook ignora o contexto; os campos só descrevem onde a falha apareceu.
const site: Parameters<ServerErrorHook>[1] = {
  kind: 'render',
  handling: 'fallback'
}

function invoke(wrap: WrapInvocationHook, run: () => unknown): unknown {
  try {
    return wrap(run, context)
  } catch (error) {
    return error
  }
}

function throwValue(value: unknown): never {
  throw value
}

function logUnavailable(): never {
  throw new Error('stderr indisponível')
}

// Simula um objeto lançado cuja inspeção falha, com o marcador na mensagem.
function hostileValue(): object {
  return new Proxy(
    {},
    {
      get: () => throwValue(new Error('PRIVATE_GET')),
      getPrototypeOf: () => throwValue(new Error('PRIVATE_PROTOTYPE'))
    }
  )
}

async function loadRegistration() {
  vi.resetModules()
  vi.mocked(configureServerErrors).mockClear()
  vi.mocked(configureServerFunctionsServer).mockClear()
  await import('../index.ts')
}

describe('registro central da política de erros', () => {
  let config: Parameters<typeof configureServerFunctionsServer>[0]
  let wrap: WrapInvocationHook
  let onError: ServerErrorHook
  // O registro é recarregado com resetModules; o módulo de erros públicos
  // precisa ser a mesma instância que o hook usa.
  let publicErrors: PublicErrors

  beforeAll(async () => {
    vi.stubEnv('DEV', false)
    await loadRegistration()
    const [registered] =
      vi.mocked(configureServerFunctionsServer).mock.calls[0] ?? []
    if (!registered?.wrapInvocation) {
      throw new Error('wrapInvocation não registrado')
    }
    config = registered
    wrap = registered.wrapInvocation
    const [errors] = vi.mocked(configureServerErrors).mock.calls[0] ?? []
    const hook = errors?.onError
    if (!hook) throw new Error('onError não registrado')
    onError = hook
    publicErrors = await import('@/infra/server/publicErrors/index.ts')
  })
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))

  it('registra somente wrapInvocation e preserva sinais de controle', () => {
    expect(Object.keys(config ?? {})).toStrictEqual(['wrapInvocation'])
    const control = redirect('/')
    expect(invoke(wrap, () => throwValue(control))).toBe(control)
    const envelope = respond({ ok: true })
    expect(invoke(wrap, () => envelope)).toMatchObject({ value: { ok: true } })
  })

  it('substitui falhas inesperadas por erro público com log filtrado', () => {
    const failure = invoke(wrap, () => throwValue(new Error('PRIVATE')))
    expect(failure).toBeInstanceOf(Error)
    expect(failure).toHaveProperty('message', PUBLIC_MESSAGE)
    expect(readLog(console.error)).toStrictEqual({
      heads: [
        [
          '[server-operation] Unexpected failure; private details omitted',
          'Error'
        ]
      ],
      leaks: []
    })
  })

  it('deixa sinais de controle com a política padrão do runtime', () => {
    for (const control of [
      redirect('/'),
      respond({ ok: true }),
      new NotReadyError(Promise.resolve('pronto'))
    ]) {
      expect(onError(control, site)).toBeUndefined()
    }
    expect(console.error).not.toHaveBeenCalled()
  })

  it.each([
    ['um Error', new Error('PRIVATE', { cause: 'CAUSE_PRIVATE' }), ['Error']],
    ['um primitivo', 'PRIVATE', []],
    ['uma Response com corpo', new Response('PRIVATE'), []],
    ['uma Response.error(), com status 0', Response.error(), []],
    ['um objeto cuja inspeção falha', hostileValue(), []]
  ])(
    'troca %s por erro público novo com log filtrado',
    (_label, failure, details) => {
      const mapped = onError(failure, site)

      // A igualdade estrita de Error compara mensagem, cause e propriedades.
      expect(mapped).toStrictEqual(new Error(PUBLIC_MESSAGE))
      expect(publicErrors.isPublicError(mapped)).toBe(true)
      expect(readLog(console.error)).toStrictEqual({
        heads: [[LOG_MESSAGE, ...details]],
        leaks: []
      })
    }
  )

  it('recria o erro público sem registrar um log duplicado', () => {
    const tampered = Object.assign(publicErrors.createPublicError(), {
      cause: 'CAUSE_PRIVATE',
      internalContext: 'PRIVATE'
    })

    const mapped = onError(tampered, { ...site, handling: 'failed' })

    expect(mapped).not.toBe(tampered)
    expect(mapped).toStrictEqual(new Error(PUBLIC_MESSAGE))
    expect(console.error).not.toHaveBeenCalled()
  })

  // A segunda tentativa grava só a linha fixa, sem o erro.
  it('registra a linha fixa mesmo quando a primeira tentativa falha', () => {
    vi.mocked(console.error).mockImplementationOnce(() => {
      throw new Error('stderr indisponível')
    })

    const mapped = onError(new Error('PRIVATE'), site)

    expect(mapped).toStrictEqual(new Error(PUBLIC_MESSAGE))
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error'], [LOG_MESSAGE]],
      leaks: []
    })
  })

  it('devolve o erro público mesmo sem destino de log', () => {
    // As duas tentativas do hook falham; o mock volta ao normal depois, para
    // não afetar os logs do próprio Vitest.
    vi.mocked(console.error)
      .mockImplementationOnce(logUnavailable)
      .mockImplementationOnce(logUnavailable)

    const mapped = onError(new Error('PRIVATE'), site)

    expect(mapped).toStrictEqual(new Error(PUBLIC_MESSAGE))
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error'], [LOG_MESSAGE]],
      leaks: []
    })
  })

  it('não instala o hook em desenvolvimento', async () => {
    vi.stubEnv('DEV', true)
    await loadRegistration()

    expect(configureServerErrors).not.toHaveBeenCalled()
    expect(configureServerFunctionsServer).toHaveBeenCalledOnce()
  })
})
