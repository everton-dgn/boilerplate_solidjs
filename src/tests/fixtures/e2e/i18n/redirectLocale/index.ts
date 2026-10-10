import { localizedRedirect } from '@/i18n/localizedRedirect/index.ts'
import type { Locale } from '@/paraglide/runtime.js'

type RedirectLocaleOptions = {
  locale: Locale
  source: 'action' | 'query'
}

export async function redirectLocale({
  locale,
  source
}: RedirectLocaleOptions): Promise<Response> {
  'use server'
  await Promise.resolve()
  return localizedRedirect({
    href: `/i18n-redirect?from=${source}#target`,
    locale
  })
}
