import { isTheme } from '../index.ts'

describe('theme preference validation', () => {
  it.each(['light', 'dark', 'system'] as const)('accepts %s', theme => {
    expect(isTheme(theme)).toBe(true)
  })

  it.each([null, undefined, '', 'invalid', {}, 1])(
    'rejects an invalid preference: %s',
    value => {
      expect(isTheme(value)).toBe(false)
    }
  )
})
