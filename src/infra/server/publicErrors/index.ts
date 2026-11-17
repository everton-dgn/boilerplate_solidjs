import 'server-only'
import { m } from '@paraglide/messages.js'
import { baseLocale, type Locale } from '@paraglide/runtime.js'
import { markSafeError } from '@solidjs/web'

const errors = new WeakSet<object>()

// The error hook is synchronous and cannot throw: if the locale does not resolve,
// the message is in the base locale.
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
  // Only prevents duplicated logs. The wrapper always creates another error, even
  // if this object was changed after its creation.
  return typeof value === 'object' && value !== null && errors.has(value)
}
