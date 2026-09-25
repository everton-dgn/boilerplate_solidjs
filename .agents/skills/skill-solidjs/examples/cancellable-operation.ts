export type OperationResult<T> =
  | { status: "completed"; value: T }
  | { status: "cancelled" }
  | { status: "failed"; error: unknown }

export type CancellableOperation<T> = {
  result: Promise<OperationResult<T>>
  cancel: () => void
  isCurrent: () => boolean
}

export function runCancellable<T>(
  run: (signal: AbortSignal) => T | PromiseLike<T>
): CancellableOperation<T> {
  const controller = new AbortController()
  let active = true

  const isCurrent = () => active && !controller.signal.aborted

  const cancel = () => {
    if (!active) return
    active = false
    controller.abort()
  }

  const result = (async (): Promise<OperationResult<T>> => {
    try {
      const value = await run(controller.signal)
      return isCurrent()
        ? { status: "completed", value }
        : { status: "cancelled" }
    } catch (error: unknown) {
      return isCurrent()
        ? { status: "failed", error }
        : { status: "cancelled" }
    }
  })()

  return { result, cancel, isCurrent }
}
