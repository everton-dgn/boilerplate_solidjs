import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'

import { createPublicError } from '../publicErrors/index.ts'

type PublicationScope = {
  signal: AbortSignal
  isActive: () => boolean
  observe: (operation: Promise<unknown>) => void
}
type ScopeOptions<T> = PublicationScope & { run: () => T }

const storage = new AsyncLocalStorage<PublicationScope>()

export function withPublicationScope<T>({ run, ...scope }: ScopeOptions<T>): T {
  return storage.run(scope, run)
}

export function assertPublicationActive(): void {
  const scope = storage.getStore()
  if (!scope) return
  if (scope.signal.aborted) throw createPublicError()
  if (!scope.isActive()) throw new Error('Publication already completed')
}

export function observePublicationOperation(operation: Promise<unknown>): void {
  storage.getStore()?.observe(operation)
}
