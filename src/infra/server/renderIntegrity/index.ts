import 'server-only'
import type { RequestEvent, RequestEventLocals } from '@solidjs/web'

type SsrRenderState = NonNullable<RequestEventLocals['ssrRenderState']>
type RenderIntegrity = {
  state: SsrRenderState
  complete: () => void
}

// O estado exposto é somente leitura; só quem o criou consegue marcá-lo.
const markers = new WeakMap<SsrRenderState, () => void>()
let isObserved = false

// Sem o hook registrado, nenhuma falha marcaria o estado: ele nasce com
// hasErrors indefinido, que o Markdown recusa.
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
