import { m } from '@/paraglide/messages.js'

export async function readLocaleTitle(): Promise<string> {
  'use server'
  // Confere o contexto do idioma depois de uma continuação assíncrona.
  await Promise.resolve()
  return m.home_title()
}
