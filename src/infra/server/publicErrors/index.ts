import 'server-only'
import { m } from '@paraglide/messages.js'
import { baseLocale, type Locale } from '@paraglide/runtime.js'
import { markSafeError } from '@solidjs/web'

const errors = new WeakSet<object>()

// O hook de erros é síncrono e não pode lançar: se o idioma não resolver, a
// mensagem sai no idioma base.
export function publicErrorMessage(locale?: Locale): string {
  try {
    return m.publicErrors_message({}, { locale })
  } catch {
    return m.publicErrors_message({}, { locale: baseLocale })
  }
}

export function createPublicError(): Error {
  const error = markSafeError(new Error(publicErrorMessage()))
  errors.add(error)
  return error
}

export function isPublicError(value: unknown): boolean {
  // Serve apenas para evitar logs duplicados. O wrapper sempre cria outro
  // erro, mesmo se este objeto tiver sido alterado depois de sua criação.
  return typeof value === 'object' && value !== null && errors.has(value)
}
