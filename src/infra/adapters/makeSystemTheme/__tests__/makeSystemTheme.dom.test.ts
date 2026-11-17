import { makeSystemTheme } from '../index.ts'

let media: EventTarget & { matches: boolean }

describe('system theme preference', () => {
  beforeEach(() => {
    media = Object.assign(new EventTarget(), { matches: false })
    vi.stubGlobal('matchMedia', () => media)
  })

  it('reports the current preference on start', () => {
    const receive = vi.fn<() => void>()
    const system = makeSystemTheme(receive)
    onTestFinished(system.dispose)
    expect(receive).toHaveBeenCalledExactlyOnceWith('light')
  })

  it('reports dark when the system is already dark', () => {
    media.matches = true
    const receive = vi.fn<() => void>()
    const system = makeSystemTheme(receive)
    onTestFinished(system.dispose)
    expect(receive).toHaveBeenCalledExactlyOnceWith('dark')
  })

  it('follows system changes', () => {
    const receive = vi.fn<() => void>()
    const system = makeSystemTheme(receive)
    onTestFinished(system.dispose)
    media.matches = true
    media.dispatchEvent(new Event('change'))
    expect(receive).toHaveBeenLastCalledWith('dark')
  })

  it('stops following after disposal', () => {
    const receive = vi.fn<() => void>()
    const system = makeSystemTheme(receive)
    system.dispose()
    receive.mockClear()
    media.matches = true
    media.dispatchEvent(new Event('change'))
    expect(receive).not.toHaveBeenCalled()
  })
})
