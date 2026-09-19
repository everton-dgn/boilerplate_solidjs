import 'server-only'
import { isResponseEnvelope, respond } from '@solidjs/web'
import { NotReadyError } from 'solid-js'

import {
  createPublicError,
  isPublicError
} from '@/infra/server/publicErrors/index.ts'

type Operation<T> = { run: () => T; allowControl?: boolean }
type DataCheck = { value: unknown; path?: Set<object>; done?: WeakSet<object> }

const PUBLIC_PRIMITIVE_TYPES = new Set([
  'undefined',
  'string',
  'number',
  'boolean'
])

// O contrato admite dados resolvidos. Erros, promises e streams dentro do
// resultado poderiam falhar ou expor diagnósticos depois desta fronteira.
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
  // Uma referência compartilhada já verificada não é percorrida de novo: sem
  // essa memória o custo cresce exponencialmente com a profundidade do grafo.
  if (done.has(value)) return
  path.add(value)
  // Reflect.ownKeys inclui chaves Symbol e propriedades não enumeráveis, que
  // Object.values sobre os descritores deixaria passar sem inspeção.
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

function controlResponse(value: unknown): unknown {
  // O transporte nunca devolve Response upstream. Respostas deliberadas da
  // aplicação preservam o contrato de redirecionamento/reload do framework.
  if (value instanceof Response && value.body === null) return value
  if (isResponseEnvelope(value)) {
    assertPublicData({ value: value.value })
    // Reconstrói o corpo a partir dos dados verificados, sem encaminhar um
    // corpo arbitrário anexado ao envelope.
    return respond(value.value, {
      status: value.response?.status,
      headers: value.response?.headers
    })
  }
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
    let control: unknown
    if (allowControl) {
      try {
        control =
          error instanceof NotReadyError ? error : controlResponse(error)
      } catch {
        // A inspeção de um objeto de exceção também pode falhar.
      }
    }
    // oxlint-disable-next-line typescript/only-throw-error -- O Solid usa Response/ResponseEnvelope como sinais de controle.
    if (control) throw control
    if (!isPublicError(error)) {
      // Nunca registre o objeto original, argumentos, URLs ou corpos upstream.
      console.error(
        '[server-operation] Unexpected failure; private details omitted'
      )
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
    const result = run()
    if (isPromiseLike(result)) return settle(result)
    return publicResult(result)
  } catch (error) {
    return publicFailure(error)
  }
}
