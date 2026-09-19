import { makeSystemTheme } from '../index.ts'

let media: EventTarget & { matches: boolean }

describe('preferência de tema do sistema', () => {
  beforeEach(() => {
    media = Object.assign(new EventTarget(), { matches: false })
    vi.stubGlobal('matchMedia', () => media)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('informa a preferência atual ao iniciar', () => {
    const receive = vi.fn<() => void>()
    const system = makeSystemTheme(receive)
    onTestFinished(system.dispose)
    expect(receive).toHaveBeenCalledExactlyOnceWith('light')
  })

  it('informa dark quando o sistema já está escuro', () => {
    media.matches = true
    const receive = vi.fn<() => void>()
    const system = makeSystemTheme(receive)
    onTestFinished(system.dispose)
    expect(receive).toHaveBeenCalledExactlyOnceWith('dark')
  })

  it('acompanha mudanças do sistema', () => {
    const receive = vi.fn<() => void>()
    const system = makeSystemTheme(receive)
    onTestFinished(system.dispose)
    media.matches = true
    media.dispatchEvent(new Event('change'))
    expect(receive).toHaveBeenLastCalledWith('dark')
  })

  it('para de acompanhar após descartar', () => {
    const receive = vi.fn<() => void>()
    const system = makeSystemTheme(receive)
    system.dispose()
    receive.mockClear()
    media.matches = true
    media.dispatchEvent(new Event('change'))
    expect(receive).not.toHaveBeenCalled()
  })
})
