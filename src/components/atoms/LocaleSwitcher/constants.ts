import type { Locale } from '@paraglide/runtime.js'

// Autônimos não são traduzidos: cada idioma aparece no próprio nome.
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  pt: 'Português',
  en: 'English',
  es: 'Español'
}
