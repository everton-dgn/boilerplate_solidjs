import type { Locale } from '@paraglide/runtime.js'

// Autonyms are not translated: each locale shows up in its own name.
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  pt: 'Português',
  en: 'English',
  es: 'Español'
}
