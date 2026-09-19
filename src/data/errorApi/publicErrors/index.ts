import 'server-only'
import { markSafeError } from '@solidjs/web'

const errors = new WeakSet<object>()
const PUBLIC_MESSAGE = 'Não foi possível concluir a solicitação.'

export function createPublicError(): Error {
  const error = markSafeError(new Error(PUBLIC_MESSAGE))
  errors.add(error)
  return error
}

export function isPublicError(value: unknown): boolean {
  // Serve apenas para evitar logs duplicados. O wrapper sempre cria outro
  // erro, mesmo se este objeto tiver sido alterado depois de sua criação.
  return typeof value === 'object' && value !== null && errors.has(value)
}
