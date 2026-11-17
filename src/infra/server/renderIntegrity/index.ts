import 'server-only'
import type { RequestEvent, RequestEventLocals } from '@solidjs/web'

type SsrRenderState = NonNullable<RequestEventLocals['ssrRenderState']>
type RenderIntegrity = {
  state: SsrRenderState
  complete: () => void
}

// The exposed state is read-only; only its creator can mark it.
const markers = new WeakMap<SsrRenderState, () => void>()
let isObserved = false

// Without the registered hook, no failure would mark the state: it starts with an
// undefined hasErrors, which the Markdown refuses.
export function observeRenderFailures(): void {
  isObserved = true
}

export function createRenderIntegrity(): RenderIntegrity {
  let hasErrors = isObserved ? false : undefined
  let hasCompleted = false
  const state: SsrRenderState = {
    get hasErrors() {
      return hasErrors
    },
    get hasCompleted() {
      return hasCompleted
    }
  }
  markers.set(state, () => {
    hasErrors = true
  })
  return {
    state,
    complete: () => {
      hasCompleted = true
    }
  }
}

export function markRenderFailure(event: RequestEvent | undefined): void {
  const state = event?.locals.ssrRenderState
  if (state) markers.get(state)?.()
}
