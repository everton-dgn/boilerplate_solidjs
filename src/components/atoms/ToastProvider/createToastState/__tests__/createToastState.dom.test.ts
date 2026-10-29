import { createRoot, flush } from 'solid-js'

import { createToastState } from '../index.ts'

const ANNOUNCEMENT_DELAY = 150

type ToastState = ReturnType<typeof createToastState>

function makeState(): ToastState {
  return createRoot(dispose => {
    onTestFinished(dispose)
    return createToastState({
      beforeRemove: () => {
        /* Sem DOM para devolver o foco. */
      }
    })
  })
}

describe('estado das notificações', () => {
  it('não publica novo anúncio quando o lote volta ao texto já anunciado', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const state = makeState()
    const id = state.api.show({ message: 'A', duration: 0 })
    vi.advanceTimersByTime(ANNOUNCEMENT_DELAY)
    flush()
    const announced = state.polite()
    expect(announced).toMatchObject({ id, message: 'A' })
    state.api.update({ id, message: 'B' })
    state.api.update({ id, message: 'A' })
    vi.advanceTimersByTime(ANNOUNCEMENT_DELAY)
    flush()
    expect(state.polite()).toBe(announced)
  })

  it('anuncia um toast novo de texto repetido mesmo que outro volte ao texto no lote', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const state = makeState()
    const first = state.api.show({ message: 'Salvo', duration: 0 })
    vi.advanceTimersByTime(ANNOUNCEMENT_DELAY)
    flush()
    const second = state.api.show({ message: 'Salvo', duration: 0 })
    state.api.update({ id: first, message: 'Outro' })
    state.api.update({ id: first, message: 'Salvo' })
    vi.advanceTimersByTime(ANNOUNCEMENT_DELAY)
    flush()
    expect(second).not.toBe(first)
    expect(state.polite()).toMatchObject({ message: 'Salvo' })
  })
})
