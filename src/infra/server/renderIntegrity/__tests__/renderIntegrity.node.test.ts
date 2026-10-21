import { createRequestEvent, type RequestEvent } from '@solidjs/web'

import type {
  createRenderIntegrity,
  markRenderFailure,
  observeRenderFailures
} from '../index.ts'

type RenderIntegrityModule = {
  createRenderIntegrity: typeof createRenderIntegrity
  markRenderFailure: typeof markRenderFailure
  observeRenderFailures: typeof observeRenderFailures
}

// O registro do hook é estado do módulo; cada teste parte de uma instância nova.
function loadModule(): Promise<RenderIntegrityModule> {
  vi.resetModules()
  return import('../index.ts')
}

function requestEvent(): RequestEvent {
  return createRequestEvent(new Request('http://localhost/'))
}

describe('estado de integridade do render', () => {
  it('deixa hasErrors indefinido enquanto o hook não se registrou', async () => {
    const { createRenderIntegrity, markRenderFailure } = await loadModule()
    const { state, complete } = createRenderIntegrity()
    const event = requestEvent()
    event.locals.ssrRenderState = state

    markRenderFailure(event)
    complete()

    expect(state).toStrictEqual({ hasErrors: true, hasCompleted: true })
    expect(createRenderIntegrity().state.hasErrors).toBeUndefined()
  })

  it('começa sem erros depois do registro e marca a falha do evento', async () => {
    const { createRenderIntegrity, markRenderFailure, observeRenderFailures } =
      await loadModule()
    observeRenderFailures()
    const { state, complete } = createRenderIntegrity()
    const other = createRenderIntegrity().state
    const event = requestEvent()
    event.locals.ssrRenderState = state

    expect(state).toStrictEqual({ hasErrors: false, hasCompleted: false })
    markRenderFailure(event)
    complete()
    expect({ state, other }).toStrictEqual({
      state: { hasErrors: true, hasCompleted: true },
      other: { hasErrors: false, hasCompleted: false }
    })
  })

  it('ignora eventos sem estado e estados criados fora da fábrica', async () => {
    const { markRenderFailure, observeRenderFailures } = await loadModule()
    observeRenderFailures()
    const event = requestEvent()
    const literal = { hasErrors: false, hasCompleted: true }

    markRenderFailure(event)
    event.locals.ssrRenderState = literal
    markRenderFailure(event)

    expect(literal.hasErrors).toBe(false)
  })
})
