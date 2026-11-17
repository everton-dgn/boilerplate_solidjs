import { baseLocale, getLocale, setLocale } from '@paraglide/runtime.js'

describe('locale isolation between browser tests', () => {
  beforeAll(() => setLocale('pt', { reload: false }))

  afterAll(() => setLocale(baseLocale, { reload: false }))

  it('starts in the base locale even with an earlier preference', () => {
    expect(getLocale()).toBe(baseLocale)
    void setLocale('es', { reload: false })
    expect(getLocale()).toBe('es')
  })

  it('drops the preference written by the earlier test', () => {
    expect(getLocale()).toBe(baseLocale)
  })
})
