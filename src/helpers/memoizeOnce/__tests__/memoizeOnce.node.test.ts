import { memoizeOnce } from '../index.ts'

type Render = () => string

const RENDERS_WITHOUT_CACHE = 2

describe('memoização única do texto', () => {
  it('renderiza uma vez e reutiliza o texto', () => {
    const render = vi.fn<Render>(() => 'text')
    const memoized = memoizeOnce({ render, enabled: true })

    expect(memoized()).toBe('text')
    expect(memoized()).toBe('text')
    expect(render).toHaveBeenCalledOnce()
  })

  it('guarda também um texto vazio', () => {
    const render = vi.fn<Render>(() => '')
    const memoized = memoizeOnce({ render, enabled: true })

    expect(memoized()).toBe('')
    expect(memoized()).toBe('')
    expect(render).toHaveBeenCalledOnce()
  })

  it('guarda qualquer valor, inclusive objetos e undefined', () => {
    const manifest = { entries: [] }
    const memoizedObject = memoizeOnce({
      render: () => manifest,
      enabled: true
    })
    const render = vi.fn<() => string | undefined>()
    const memoizedUndefined = memoizeOnce({ render, enabled: true })

    expect(memoizedObject()).toBe(memoizedObject())
    expect(memoizedObject()).toBe(manifest)
    expect(memoizedUndefined()).toBeUndefined()
    expect(memoizedUndefined()).toBeUndefined()
    expect(render).toHaveBeenCalledOnce()
  })

  it('não guarda uma falha e tenta renderizar de novo na próxima chamada', () => {
    const render = vi
      .fn<Render>()
      .mockImplementationOnce(() => {
        throw new Error('manifesto indisponível')
      })
      .mockReturnValue('text')
    const memoized = memoizeOnce({ render, enabled: true })

    expect(() => memoized()).toThrow('manifesto indisponível')
    expect(memoized()).toBe('text')
    expect(render).toHaveBeenCalledTimes(RENDERS_WITHOUT_CACHE)
  })

  it('desabilitado, devolve o render original sem cache', () => {
    const render = vi.fn<Render>(() => 'text')
    const memoized = memoizeOnce({ render, enabled: false })

    expect(memoized).toBe(render)
    memoized()
    memoized()
    expect(render).toHaveBeenCalledTimes(RENDERS_WITHOUT_CACHE)
  })
})
