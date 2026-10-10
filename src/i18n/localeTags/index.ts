import type { Locale } from '@/paraglide/runtime.js'

// BCP 47 para HTML e JSON-LD. Open Graph usa os mesmos códigos com '_'.
export const LOCALE_TAGS = {
  pt: 'pt-BR',
  en: 'en-US',
  es: 'es-ES'
} as const satisfies Record<Locale, string>
