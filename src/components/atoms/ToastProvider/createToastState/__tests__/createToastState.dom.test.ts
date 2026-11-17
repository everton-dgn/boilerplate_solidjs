import { createRoot, flush } from 'solid-js'

import { createToastState } from '../index.ts'

const ANNOUNCEMENT_DELAY = 150

type ToastState = ReturnType<typeof createToastState>

function makeState(): ToastState {
  return createRoot(dispose => {
    onTestFinished(dispose)
    return createToastState({
      beforeRemove: () => {
        /* No DOM to return the focus to. */
      }
    })
  })
}

describe('notification state', () => {
  it('announces a new toast with repeated text even if another one goes back to that text in the batch', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const state = makeState()
    const first = state.api.show({ message: 'Salvo', duration: 0 })
    vi.advanceTimersByTime(ANNOUNCEMENT_DELAY)
    flush()
    const announced = state.polite()
    expect(announced).toMatchObject({ id: first, message: 'Salvo' })
    const second = state.api.show({ message: 'Salvo', duration: 0 })
    flush()
    expect(second).not.toBe(first)
    expect(state.polite()).toBeUndefined()
    state.api.update({ id: first, message: 'Other' })
    state.api.update({ id: first, message: 'Salvo' })
    vi.advanceTimersByTime(ANNOUNCEMENT_DELAY)
    flush()
    expect(state.polite()).toMatchObject({ message: 'Salvo' })
    expect(state.polite()).not.toBe(announced)
  })
})
