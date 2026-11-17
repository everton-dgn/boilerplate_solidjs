import 'server-only'
import { isResponseEnvelope, respond } from '@solidjs/web'
import { NotReadyError } from 'solid-js'

import { isControlResponse } from '@/infra/server/isControlResponse/index.ts'
import { logServerFailure } from '@/infra/server/logServerFailure/index.ts'
import {
  createPublicError,
  isPublicError
} from '@/infra/server/publicErrors/index.ts'

import {
  assertPublicationActive,
  isPublicationCancellation,
  observePublicationOperation
} from '../publicationScope/index.ts'

type Operation<T> = { run: () => T; allowControl?: boolean }
type DataCheck = { value: unknown; path?: Set<object>; done?: WeakSet<object> }

const PUBLIC_PRIMITIVE_TYPES = new Set([
  'undefined',
  'string',
  'number',
  'boolean'
])

// The contract allows resolved data. Errors, promises and streams inside the
// result could fail or expose diagnostics after this boundary.
function assertPublicData({
  value,
  path = new Set<object>(),
  done = new WeakSet<object>()
}: DataCheck): void {
  if (value === null || PUBLIC_PRIMITIVE_TYPES.has(typeof value)) return
  if (typeof value !== 'object' || value instanceof Error) {
    throw new TypeError('Server operations must return plain public data')
  }
  const prototype: unknown = Object.getPrototypeOf(value)
  if (
    Array.isArray(value)
      ? prototype !== Array.prototype
      : prototype !== Object.prototype && prototype !== null
  ) {
    throw new Error('Server operations must return plain public data')
  }
  if (path.has(value)) {
    throw new Error('Server operations must return acyclic data')
  }
  // A shared reference already checked is not walked again: without that memory
  // the cost grows exponentially with the depth of the graph.
  if (done.has(value)) return
  path.add(value)
  // Reflect.ownKeys includes Symbol keys and non-enumerable properties, which
  // Object.values over the descriptors would let through without inspection.
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor?.get || descriptor?.set) {
      throw new Error('Server operations must return resolved data')
    }
    const field: unknown = descriptor?.value
    assertPublicData({ value: field, path, done })
  }
  path.delete(value)
  done.add(value)
}

function controlResponse(value: unknown): Response | undefined {
  // The transport never returns an upstream Response. Deliberate responses of the
  // application keep the redirect/reload contract of the framework. Envelopes are
  // Responses too, even when they have no body.
  if (isResponseEnvelope(value)) {
    assertPublicData({ value: value.value })
    // Rebuilds the body from the checked data, without forwarding an arbitrary
    // body attached to the envelope.
    const rebuilt: unknown = respond(value.value, {
      status: value.response?.status,
      headers: value.response?.headers
    })
    if (isResponseEnvelope(rebuilt)) return rebuilt
    throw new TypeError('Expected a response envelope')
  }
  if (isControlResponse(value)) return value
  return undefined
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  )
}

export function protectServerOperation<T>(operation: Operation<T>): T

export function protectServerOperation({
  run,
  allowControl = false
}: Operation<unknown>): unknown {
  function publicFailure(error: unknown): never {
    let control: Response | NotReadyError | undefined
    if (allowControl) {
      try {
        control =
          error instanceof NotReadyError ? error : controlResponse(error)
      } catch {
        // Inspecting an exception object can also fail.
      }
    }
    // oxlint-disable-next-line typescript/only-throw-error -- Solid uses Response/ResponseEnvelope as control signals.
    if (control) throw control
    if (!isPublicError(error) && !isPublicationCancellation(error)) {
      // The public error thrown below is the only one that reaches the hook; in
      // development the log brings the original back to the terminal.
      logServerFailure({
        source: 'server-operation',
        error,
        shouldPrintOriginal: import.meta.env.DEV
      })
    }
    throw createPublicError()
  }

  function publicResult(value: unknown): unknown {
    if (allowControl) {
      const control = controlResponse(value)
      if (control) return control
    }
    assertPublicData({ value })
    return value
  }

  async function settle(result: PromiseLike<unknown>): Promise<unknown> {
    try {
      return publicResult(await result)
    } catch (error) {
      return publicFailure(error)
    }
  }

  try {
    assertPublicationActive()
    const result = run()
    if (isPromiseLike(result)) {
      const operation = settle(result)
      observePublicationOperation(operation)
      return operation
    }
    return publicResult(result)
  } catch (error) {
    return publicFailure(error)
  }
}
