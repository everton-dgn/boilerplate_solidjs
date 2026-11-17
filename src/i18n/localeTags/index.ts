import type { Locale } from '@paraglide/runtime.js'

// BCP 47 for HTML and JSON-LD. Open Graph uses the same codes with '_'.
export const LOCALE_TAGS = {
  pt: 'pt-BR',
  en: 'en-US',
  es: 'es-ES'
} as const satisfies Record<Locale, string>
