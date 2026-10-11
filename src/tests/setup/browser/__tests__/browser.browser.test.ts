import { baseLocale, getLocale, setLocale } from '@paraglide/runtime.js'

describe('isolamento do idioma entre testes de navegador', () => {
  beforeAll(() => setLocale('pt', { reload: false }))

  afterAll(() => setLocale(baseLocale, { reload: false }))

  it('começa no idioma base mesmo com uma preferência anterior', () => {
    expect(getLocale()).toBe(baseLocale)
    setLocale('es', { reload: false })
    expect(getLocale()).toBe('es')
  })

  it('descarta a preferência gravada pelo teste anterior', () => {
    expect(getLocale()).toBe(baseLocale)
  })
})
