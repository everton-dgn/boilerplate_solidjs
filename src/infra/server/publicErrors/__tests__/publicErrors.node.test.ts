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

describe('mensagem dos erros públicos', () => {
  it('usa o idioma base fora do contexto de idioma do paraglide', () => {
    const error = createPublicError()

    expect(error).toStrictEqual(new Error(MESSAGES.en))
    expect(isPublicError(error)).toBe(true)
  })

  it.each(LOCALES)(
    'usa o idioma %s da requisição dentro do contexto de idioma',
    async locale => {
      const response = await paraglideMiddleware(
        new Request(`http://localhost/${locale}`),
        () => new Response(createPublicError().message)
      )

      await expect(response.text()).resolves.toBe(MESSAGES[locale])
    }
  )

  it.each(LOCALES)('aceita o idioma %s explícito', locale => {
    expect(publicErrorMessage(locale)).toBe(MESSAGES[locale])
  })

  // O hook de erros chama a fábrica de forma síncrona e não pode lançar.
  it('cai no idioma base sem lançar quando o idioma não resolve', () => {
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
