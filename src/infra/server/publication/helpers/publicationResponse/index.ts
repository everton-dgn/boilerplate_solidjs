import 'server-only'
import {
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_SERVICE_UNAVAILABLE
} from '@/constants/http.ts'

import type { PublicationOptions } from '../../types.ts'
import { observeSettlement } from '../observeSettlement/index.ts'

type OutputOptions = {
  response: Response
  signal: AbortSignal
  maxOutputBytes: number
  releaseOutput: () => void
}
type AbortListenerHolder = { onAbort?: () => void }
type BypassOptions = { response: Response; kind: PublicationOptions['kind'] }
type HeadOptions = {
  response: Response
  abortPromise: Promise<never>
  signal: AbortSignal
  releaseOutput: () => void
}

export function errorResponse(): Response {
  return new Response(null, {
    status: HTTP_INTERNAL_SERVER_ERROR,
    headers: { 'cache-control': 'no-store' }
  })
}

export function overloadResponse(method: string): Response {
  return new Response(method === 'HEAD' ? null : 'Service unavailable\n', {
    status: HTTP_SERVICE_UNAVAILABLE,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '1'
    }
  })
}

export function shouldBypassOutput({ response, kind }: BypassOptions): boolean {
  return (
    !response.body ||
    (kind === 'markdown' &&
      !response.headers.get('content-type')?.startsWith('text/markdown'))
  )
}

export async function handleHeadResponse({
  response,
  abortPromise,
  signal,
  releaseOutput
}: HeadOptions): Promise<Response> {
  const cancellation = response.body?.cancel()
  if (!cancellation) {
    releaseOutput()
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    })
  }
  void observeSettlement({ task: cancellation, settle: releaseOutput })
  try {
    await Promise.race([cancellation, abortPromise])
  } catch (error) {
    if (signal.aborted) return errorResponse()
    throw error
  }
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  })
}

export function createOutputResponse({
  response,
  signal,
  maxOutputBytes,
  releaseOutput
}: OutputOptions): Response {
  if (!response.body) throw new Error('Publication response has no body')
  const reader = response.body.getReader()
  let bytes = 0
  let outputController: ReadableStreamDefaultController<Uint8Array>
  let hasStreamEnded = false
  const isEnded = () => hasStreamEnded
  const listener: AbortListenerHolder = {}
  const finishOutput = () => {
    if (listener.onAbort) signal.removeEventListener('abort', listener.onAbort)
    releaseOutput()
  }
  const stop = async (reason: unknown) => {
    if (isEnded()) return
    hasStreamEnded = true
    try {
      outputController.error(reason)
    } catch {
      /* Já fechado pelo consumidor. */
    }
    try {
      await reader.cancel(reason)
    } catch {
      /* O cancelamento é de melhor esforço. */
    }
    finishOutput()
  }
  listener.onAbort = () => {
    void stop(signal.reason)
  }
  const body = new ReadableStream<Uint8Array>(
    {
      start(target) {
        outputController = target
      },
      async pull(target) {
        if (isEnded()) return
        try {
          signal.throwIfAborted()
          const chunk = await reader.read()
          if (isEnded()) return
          if (chunk.done) {
            hasStreamEnded = true
            target.close()
            finishOutput()
            return
          }
          bytes += chunk.value.byteLength
          if (bytes > maxOutputBytes) {
            void stop(new Error('Publication output limit exceeded'))
            return
          }
          target.enqueue(chunk.value)
        } catch (error) {
          void stop(error)
        }
      },
      cancel(reason) {
        return stop(reason)
      }
    },
    { highWaterMark: 0 }
  )
  signal.addEventListener('abort', listener.onAbort, { once: true })
  if (signal.aborted) listener.onAbort()
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  })
}
