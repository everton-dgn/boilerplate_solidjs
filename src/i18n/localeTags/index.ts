import type { Locale } from '@paraglide/runtime.js'

type LocaleTagValues = {
  pt: 'pt-BR'
  en: 'en-US'
  es: 'es-ES'
}

type LocaleTags = {
  readonly [Language in Locale]: LocaleTagValues[Language]
}

// BCP 47 para HTML e JSON-LD. Open Graph usa os mesmos códigos com '_'.
export const LOCALE_TAGS: LocaleTags = {
  pt: 'pt-BR',
  en: 'en-US',
  es: 'es-ES'
}
