import {
  configureServerErrors,
  createRequestEvent,
  redirect,
  respond,
  type RequestEvent,
  type RequestEventLocals,
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
import type { createRenderIntegrity } from '@/infra/server/renderIntegrity/index.ts'
import {
  hostileValue,
  throwValue
} from '@/tests/helpers/failureValues/index.ts'
import { readLog } from '@/tests/helpers/readLog/index.ts'

vi.mock(import('@solidjs/web'), async importOriginal => ({
  ...(await importOriginal()),
  configureServerErrors: vi.fn<typeof configureServerErrors>()
}))
vi.mock(import('@solidjs/web/server-functions/server'), () => ({
  configureServerFunctionsServer: vi.fn<typeof configureServerFunctionsServer>()
}))

// Without the paraglide locale context, the message is in the base locale.
const PUBLIC_MESSAGE = 'The request could not be completed.'
const LOG_MESSAGE = '[server-error] Unexpected failure; private details omitted'
const HTTP_NOT_FOUND = 404

type PublicErrors = {
  createPublicError: typeof createPublicError
  isPublicError: typeof isPublicError
}

type RenderState = NonNullable<RequestEventLocals['ssrRenderState']>
type RenderProbe = { event: RequestEvent; state: RenderState }
type CreateRenderIntegrity = typeof createRenderIntegrity

// The wrapper ignores the invocation context; the registration only needs run.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ServerFunctionEvent cannot be built outside the Solid runtime.
const context = {} as Parameters<WrapInvocationHook>[1]
// The hook ignores the context; the fields only describe where the failure showed up.
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

function logUnavailable(): never {
  throw new Error('stderr unavailable')
}

function registeredHook(): ServerErrorHook {
  const [errors] = vi.mocked(configureServerErrors).mock.lastCall ?? []
  const hook = errors?.onError
  if (!hook) throw new Error('onError not registered')
  return hook
}

// The registration is reloaded with resetModules; the factory must come from the
// same load as the hook that marks the state.
function renderProbe(createIntegrity: CreateRenderIntegrity): RenderProbe {
  const event = createRequestEvent(new Request('http://localhost/'))
  const { state } = createIntegrity()
  event.locals.ssrRenderState = state
  return { event, state }
}

async function loadRegistration() {
  vi.resetModules()
  vi.mocked(configureServerErrors).mockClear()
  vi.mocked(configureServerFunctionsServer).mockClear()
  await import('../index.ts')
}

describe('central registration of the error policy', () => {
  let config: Parameters<typeof configureServerFunctionsServer>[0]
  let wrap: WrapInvocationHook
  let onError: ServerErrorHook
  // The registration is reloaded with resetModules; the public errors module must
  // be the same instance that the hook uses.
  let publicErrors: PublicErrors
  let createIntegrity: CreateRenderIntegrity

  beforeAll(async () => {
    vi.stubEnv('DEV', false)
    await loadRegistration()
    const [registered] =
      vi.mocked(configureServerFunctionsServer).mock.calls[0] ?? []
    if (!registered?.wrapInvocation) {
      throw new Error('wrapInvocation not registered')
    }
    config = registered
    wrap = registered.wrapInvocation
    onError = registeredHook()
    publicErrors = await import('@/infra/server/publicErrors/index.ts')
    ;({ createRenderIntegrity: createIntegrity } =
      await import('@/infra/server/renderIntegrity/index.ts'))
  })
  // unstubEnvs undoes the beforeAll stub before each case; it only pins the mode
  // read when the registration loads.
  beforeEach(() => {
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockImplementation(vi.fn())
  })

  it('registers only wrapInvocation and keeps control signals', () => {
    expect(Object.keys(config ?? {})).toStrictEqual(['wrapInvocation'])
    const control = redirect('/')
    expect(invoke(wrap, () => throwValue(control))).toBe(control)
    const envelope = respond({ ok: true })
    expect(invoke(wrap, () => envelope)).toMatchObject({ value: { ok: true } })
  })

  it('replaces unexpected failures with a public error and a filtered log', () => {
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

  it('leaves control signals to the default policy of the runtime', () => {
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
    ['an Error', new Error('PRIVATE', { cause: 'CAUSE_PRIVATE' }), ['Error']],
    ['a primitive', 'PRIVATE', []],
    ['a Response with a body', new Response('PRIVATE'), []],
    ['a Response.error(), with status 0', Response.error(), []],
    ['an object whose inspection fails', hostileValue(), []]
  ])(
    'replaces %s with a new public error and a filtered log',
    (_label, failure, details) => {
      const mapped = onError(failure, site)

      // Strict Error equality compares the message, cause and properties.
      expect(mapped).toStrictEqual(new Error(PUBLIC_MESSAGE))
      expect(publicErrors.isPublicError(mapped)).toBe(true)
      expect(readLog(console.error)).toStrictEqual({
        heads: [[LOG_MESSAGE, ...details]],
        leaks: []
      })
    }
  )

  it('recreates the public error without writing a duplicated log', () => {
    const tampered = Object.assign(publicErrors.createPublicError(), {
      cause: 'CAUSE_PRIVATE',
      internalContext: 'PRIVATE'
    })

    const mapped = onError(tampered, { ...site, handling: 'failed' })

    expect(mapped).not.toBe(tampered)
    expect(mapped).toStrictEqual(new Error(PUBLIC_MESSAGE))
    expect(console.error).not.toHaveBeenCalled()
  })

  // The second attempt writes only the fixed line, without the error.
  it('writes the fixed line even when the first attempt fails', () => {
    vi.mocked(console.error).mockImplementationOnce(() => {
      throw new Error('stderr unavailable')
    })

    const mapped = onError(new Error('PRIVATE'), site)

    expect(mapped).toStrictEqual(new Error(PUBLIC_MESSAGE))
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error'], [LOG_MESSAGE]],
      leaks: []
    })
  })

  it('returns the public error even without a log destination', () => {
    // Both attempts of the hook fail; the mock goes back to normal afterwards, so
    // it does not affect the logs of Vitest itself.
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

  it('marks the render state only on render failures', () => {
    const { event, state } = renderProbe(createIntegrity)

    onError(new Error('PRIVATE'), {
      kind: 'server-function',
      handling: 'thrown',
      event
    })
    expect(state.hasErrors).toBe(false)
    onError(new Error('PRIVATE'), { ...site, event })
    expect(state.hasErrors).toBe(true)
  })

  it.each([
    ['a redirect()', redirect('/')],
    ['a respond()', respond({ ok: true }, { status: HTTP_NOT_FOUND })]
  ])('marks the render state with %s too', (_name, control) => {
    const { event, state } = renderProbe(createIntegrity)

    expect(onError(control, { ...site, event })).toBeUndefined()
    expect(state.hasErrors).toBe(true)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('installs the hook in development and prints the original error', async () => {
    vi.stubEnv('DEV', true)
    await loadRegistration()
    const { createRenderIntegrity: createFresh } =
      await import('@/infra/server/renderIntegrity/index.ts')
    const { event, state } = renderProbe(createFresh)
    const failure = new Error('PRIVATE')

    expect(registeredHook()(failure, { ...site, event })).toBeUndefined()
    expect(state.hasErrors).toBe(true)
    // The filtered log comes first; the original goes back to the terminal only in dev.
    expect(readLog(console.error).heads[0]).toStrictEqual([
      LOG_MESSAGE,
      'Error'
    ])
    expect(vi.mocked(console.error).mock.calls.slice(1)).toStrictEqual([
      [failure]
    ])
    expect(configureServerFunctionsServer).toHaveBeenCalledOnce()
  })
})
