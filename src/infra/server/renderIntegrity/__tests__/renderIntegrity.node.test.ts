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

// The hook registration is module state; each test starts from a new instance.
function loadModule(): Promise<RenderIntegrityModule> {
  vi.resetModules()
  return import('../index.ts')
}

function requestEvent(): RequestEvent {
  return createRequestEvent(new Request('http://localhost/'))
}

describe('render integrity state', () => {
  it('leaves hasErrors undefined while the hook has not registered', async () => {
    const { createRenderIntegrity, markRenderFailure } = await loadModule()
    const { state, complete } = createRenderIntegrity()
    const event = requestEvent()
    event.locals.ssrRenderState = state

    markRenderFailure(event)
    complete()

    expect(state).toStrictEqual({ hasErrors: true, hasCompleted: true })
    expect(createRenderIntegrity().state.hasErrors).toBeUndefined()
  })

  it('starts without errors after the registration and marks the failure of the event', async () => {
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

  it('ignores events without a state and states created outside the factory', async () => {
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
