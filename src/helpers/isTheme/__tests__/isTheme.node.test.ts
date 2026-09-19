/* oxlint-disable vitest/prefer-to-be-truthy, vitest/prefer-to-be-falsy -- Mantém os booleanos exatos exigidos pelo prefer-strict-boolean-matchers. */
import { isTheme } from '../index.ts'

describe('validação da preferência de tema', () => {
  it.each(['light', 'dark', 'system'] as const)('aceita %s', theme => {
    expect(isTheme(theme)).toBe(true)
  })

  it.each([null, undefined, '', 'invalid', {}, 1])(
    'rejeita preferência inválida: %s',
    value => {
      expect(isTheme(value)).toBe(false)
    }
  )
})
