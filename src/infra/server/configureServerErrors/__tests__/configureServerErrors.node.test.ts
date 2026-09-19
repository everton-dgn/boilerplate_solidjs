import { redirect, respond } from '@solidjs/web'
import {
  configureServerFunctionsServer,
  type WrapInvocationHook
} from '@solidjs/web/server-functions/server'

vi.mock(import('@solidjs/web/server-functions/server'), () => ({
  configureServerFunctionsServer: vi.fn<typeof configureServerFunctionsServer>()
}))

// O wrapper ignora o contexto da invocação; o registro só precisa de run.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ServerFunctionEvent não é construível fora do runtime do Solid.
const context = {} as Parameters<WrapInvocationHook>[1]

function invoke(wrap: WrapInvocationHook, run: () => unknown): unknown {
  try {
    return wrap(run, context)
  } catch (error) {
    return error
  }
}

function throwValue(value: unknown): never {
  // oxlint-disable-next-line typescript/only-throw-error -- Sinais de controle do Solid são Response, não Error.
  throw value
}

describe('registro central da política de erros', () => {
  let config: Parameters<typeof configureServerFunctionsServer>[0]
  let wrap: WrapInvocationHook

  beforeAll(async () => {
    await import('../index.ts')
    const [registered] =
      vi.mocked(configureServerFunctionsServer).mock.calls[0] ?? []
    if (!registered?.wrapInvocation) {
      throw new Error('wrapInvocation não registrado')
    }
    config = registered
    wrap = registered.wrapInvocation
  })
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))
  afterEach(() => vi.restoreAllMocks())

  it('registra somente wrapInvocation e preserva sinais de controle', () => {
    expect(Object.keys(config ?? {})).toStrictEqual(['wrapInvocation'])
    const control = redirect('/')
    expect(invoke(wrap, () => throwValue(control))).toBe(control)
    const envelope = respond({ ok: true })
    expect(invoke(wrap, () => envelope)).toMatchObject({ value: { ok: true } })
  })

  it('substitui falhas inesperadas por erro público com log fixo', () => {
    const failure = invoke(wrap, () => throwValue(new Error('PRIVATE')))
    expect(failure).toBeInstanceOf(Error)
    expect(failure).toHaveProperty(
      'message',
      'Não foi possível concluir a solicitação.'
    )
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      '[server-operation] Unexpected failure; private details omitted'
    )
  })
})
