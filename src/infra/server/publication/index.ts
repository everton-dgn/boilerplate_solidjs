import 'server-only'
import {
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_SERVICE_UNAVAILABLE
} from '@/constants/http.ts'

import { withPublicationScope } from '../publicationScope/index.ts'
import type {
  PublicationContext,
  PublicationLimits,
  PublicationMetrics,
  PublicationOptions,
  SourceOptions
} from './types.ts'

type OutputOptions = {
  response: Response
  signal: AbortSignal
  maxOutputBytes: number
  releaseOutput: () => void
}
type PublicationController = {
  runPublication: (options: PublicationOptions) => Promise<Response>
  getMetrics: () => PublicationMetrics
}
type AbortListenerHolder = { onAbort?: () => void }
type HeadOptions = {
  response: Response
  abortPromise: Promise<never>
  signal: AbortSignal
  releaseOutput: () => void
}

// Four process-local slots cap overlap; two per class leave room for both
// workloads. The 16 MiB reservation is an initial output budget, to calibrate
// against the serial HTTP pilot and actual backend capacity.
const DEFAULT_RESERVED_BYTES = 16_777_216

const DEFAULT_LIMITS: PublicationLimits = {
  total: 4,
  sitemap: 2,
  markdown: 2,
  sources: 4,
  perSource: 2,
  outputs: 4,
  reservedBytes: DEFAULT_RESERVED_BYTES
}

function positive(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function errorResponse(): Response {
  return new Response(null, {
    status: HTTP_INTERNAL_SERVER_ERROR,
    headers: { 'cache-control': 'no-store' }
  })
}

function overloadResponse(method: string): Response {
  return new Response(method === 'HEAD' ? null : 'Service unavailable\n', {
    status: HTTP_SERVICE_UNAVAILABLE,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '1'
    }
  })
}

async function observeSettlement(
  task: Promise<unknown>,
  settle: () => void
): Promise<void> {
  try {
    await task
  } catch {
    // The caller observes the original rejection.
  } finally {
    settle()
  }
}

class PublicationOverloadError extends Error {
  public override name = 'PublicationOverloadError'
}

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error('Publication aborted')
}

function shouldBypassOutput(
  response: Response,
  kind: PublicationOptions['kind']
): boolean {
  return (
    !response.body ||
    (kind === 'markdown' &&
      !response.headers.get('content-type')?.startsWith('text/markdown'))
  )
}

async function handleHeadResponse({
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
  void observeSettlement(cancellation, releaseOutput)
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

function createOutputResponse({
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
      /* Already closed by the consumer. */
    }
    try {
      await reader.cancel(reason)
    } catch {
      /* Cancellation is best effort. */
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

function createMetrics(): PublicationMetrics {
  return {
    active: 0,
    sitemap: 0,
    markdown: 0,
    sources: 0,
    outputs: 0,
    reservedBytes: 0,
    rejected: 0,
    aborted: 0,
    timedOut: 0
  }
}

let singleton: PublicationController | undefined

export function createPublicationController(
  limits: PublicationLimits = DEFAULT_LIMITS
): PublicationController {
  if (Object.values(limits).some(value => !positive(value))) {
    throw new RangeError('Invalid publication limits')
  }
  const config = { ...limits }
  const metrics = createMetrics()
  const sourceCounts = new WeakMap<object, number>()

  function overload(method: string): Response {
    metrics.rejected += 1
    return overloadResponse(method)
  }

  async function executePublication({
    kind,
    signal,
    method = 'GET',
    timeoutMs,
    maxOutputBytes,
    run
  }: PublicationOptions): Promise<Response> {
    if (!positive(timeoutMs) || !positive(maxOutputBytes)) {
      throw new RangeError('Invalid publication budget')
    }
    if (signal?.aborted) {
      metrics.aborted += 1
      return errorResponse()
    }
    if (
      metrics.active >= config.total ||
      metrics[kind] >= config[kind] ||
      metrics.outputs >= config.outputs ||
      maxOutputBytes > config.reservedBytes - metrics.reservedBytes
    ) {
      return overload(method)
    }

    metrics.active += 1
    metrics[kind] += 1
    metrics.outputs += 1
    metrics.reservedBytes += maxOutputBytes
    const deadlineController = new AbortController()
    const combined = signal
      ? AbortSignal.any([signal, deadlineController.signal])
      : deadlineController.signal
    let hasRunSettled = false
    let hasProducerReleased = false
    let hasOutputReleased = false
    let children = 0
    const { promise: abortPromise, reject: rejectAbort } =
      Promise.withResolvers<never>()
    const timer = setTimeout(() => {
      metrics.timedOut += 1
      deadlineController.abort(new Error('Publication deadline exceeded'))
    }, timeoutMs)
    const onAbort = () => {
      if (!deadlineController.signal.aborted) metrics.aborted += 1
      clearTimeout(timer)
      rejectAbort(
        combined.reason instanceof Error
          ? combined.reason
          : new Error('Publication aborted')
      )
    }
    combined.addEventListener('abort', onAbort, { once: true })
    if (combined.aborted) onAbort()

    const finish = () => {
      if (hasRunSettled && children === 0 && !hasProducerReleased) {
        hasProducerReleased = true
        metrics.active -= 1
        metrics[kind] -= 1
      }
      if (hasProducerReleased && hasOutputReleased) {
        clearTimeout(timer)
        combined.removeEventListener('abort', onAbort)
      }
    }
    const releaseOutput = () => {
      if (hasOutputReleased) return
      hasOutputReleased = true
      metrics.outputs -= 1
      metrics.reservedBytes -= maxOutputBytes
      finish()
    }
    const readSource = <T>({
      key,
      run: execute
    }: SourceOptions<T>): Promise<T> => {
      combined.throwIfAborted()
      if (hasProducerReleased) throw new Error('Publication already completed')
      const count = sourceCounts.get(key) ?? 0
      if (metrics.sources >= config.sources || count >= config.perSource) {
        return Promise.reject(new PublicationOverloadError())
      }
      metrics.sources += 1
      children += 1
      sourceCounts.set(key, count + 1)
      let task: Promise<T>
      try {
        combined.throwIfAborted()
        task = Promise.resolve(execute(combined))
      } catch (error) {
        task = Promise.reject(asError(error))
      }
      const settle = () => {
        metrics.sources -= 1
        children -= 1
        const remaining = (sourceCounts.get(key) ?? 1) - 1
        if (remaining) sourceCounts.set(key, remaining)
        else sourceCounts.delete(key)
        finish()
      }
      void observeSettlement(task, settle)
      return task
    }
    const context: PublicationContext = { signal: combined, readSource }
    let producer: Promise<Response>
    try {
      producer = Promise.resolve(
        withPublicationScope({
          signal: combined,
          isActive: () => !hasProducerReleased,
          observe: operation => {
            children += 1
            void observeSettlement(operation, () => {
              children -= 1
              finish()
            })
          },
          run: () => run(context)
        })
      )
    } catch (error) {
      producer = Promise.reject(asError(error))
    }
    const settleRun = () => {
      hasRunSettled = true
      finish()
    }
    void observeSettlement(producer, settleRun)

    const discardResponse = async (response: Response): Promise<void> => {
      try {
        await response.body?.cancel()
      } catch {
        // Cancellation errors cannot make the body usable again.
      } finally {
        releaseOutput()
      }
    }

    const discardProducer = async (): Promise<void> => {
      try {
        await discardResponse(await producer)
      } catch {
        releaseOutput()
      }
    }

    try {
      const response = await Promise.race([producer, abortPromise])
      if (combined.aborted) {
        void discardResponse(response)
        return errorResponse()
      }
      if (shouldBypassOutput(response, kind)) {
        releaseOutput()
        return response
      }
      if (method === 'HEAD') {
        return await handleHeadResponse({
          response,
          abortPromise,
          signal: combined,
          releaseOutput
        })
      }

      return createOutputResponse({
        response,
        signal: combined,
        maxOutputBytes,
        releaseOutput
      })
    } catch (error) {
      if (combined.aborted) {
        void discardProducer()
        return errorResponse()
      }
      releaseOutput()
      if (error instanceof PublicationOverloadError) return overload(method)
      throw error
    }
  }
  return {
    runPublication: executePublication,
    getMetrics: (): PublicationMetrics => ({ ...metrics })
  }
}

export function runPublication(options: PublicationOptions): Promise<Response> {
  singleton ??= createPublicationController()
  return singleton.runPublication(options)
}

export function getPublicationMetrics(): PublicationMetrics {
  singleton ??= createPublicationController()
  return singleton.getMetrics()
}
