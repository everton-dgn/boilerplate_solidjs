import { createEffect, type Accessor } from "solid-js"
import { runCancellable } from "./cancellable-operation"

export type SyncInput<T> = {
  key: string
  fetch: (key: string, signal: AbortSignal) => Promise<T>
  apply: (value: T) => void
  fail: (error: unknown) => void
}

export function createExternalSync<T>(
  source: Accessor<SyncInput<T>>
): void {
  createEffect(source, ({ key, fetch, apply, fail }) => {
    const task = runCancellable(signal => fetch(key, signal))

    void task.result.then(result => {
      if (!task.isCurrent()) return
      if (result.status === "completed") return apply(result.value)
      if (result.status === "failed") return fail(result.error)
    }).catch(error => {
      queueMicrotask(() => {
        throw error
      })
    })

    return task.cancel
  })
}
