import {
  getLocale,
  type Locale,
  overwriteGetLocale
} from '@paraglide/runtime.js'
import { paraglideMiddleware } from '@paraglide/server.js'

import {
  createPublicError,
  isPublicError,
  publicErrorMessage
} from '../index.ts'

const MESSAGES = {
  pt: 'Não foi possível concluir a solicitação.',
  en: 'The request could not be completed.',
  es: 'No se pudo completar la solicitud.'
} satisfies Record<Locale, string>
const LOCALES: Locale[] = ['pt', 'en', 'es']

describe('public error message', () => {
  it('uses the base locale outside the paraglide locale context', () => {
    const error = createPublicError()

    expect(error).toStrictEqual(new Error(MESSAGES.en))
    expect(isPublicError(error)).toBe(true)
  })

  it.each(LOCALES)(
    'uses the %s locale of the request inside the locale context',
    async locale => {
      const response = await paraglideMiddleware(
        new Request(`http://localhost/${locale}`),
        () => new Response(createPublicError().message)
      )

      await expect(response.text()).resolves.toBe(MESSAGES[locale])
    }
  )

  it.each(LOCALES)('accepts the explicit %s locale', locale => {
    expect(publicErrorMessage(locale)).toBe(MESSAGES[locale])
  })

  // The error hook calls the factory synchronously and cannot throw.
  it('falls back to the base locale without throwing when the locale does not resolve', () => {
    const resolveLocale = getLocale
    overwriteGetLocale(() => {
      throw new Error('PRIVATE_LOCALE')
    })
    try {
      expect(createPublicError().message).toBe(MESSAGES.en)
    } finally {
      overwriteGetLocale(resolveLocale)
    }
  })
})
