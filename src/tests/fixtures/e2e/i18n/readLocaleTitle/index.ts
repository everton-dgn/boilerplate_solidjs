import { m } from '@paraglide/messages.js'

export async function readLocaleTitle(): Promise<string> {
  'use server'
  // Checks the locale context after an async continuation.
  await Promise.resolve()
  return m.home_title()
}
