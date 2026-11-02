import { describe, expect, it, vi } from 'vite-plus/test'

import {
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE
} from '@/constants/http.ts'

import { createPublicationController } from '../index.ts'
import type { PublicationContext, PublicationLimits } from '../types.ts'

const limits: PublicationLimits = {
  total: 1,
  sitemap: 1,
  markdown: 1,
  sources: 1,
  perSource: 1,
  outputs: 1,
  reservedBytes: 100
}

const OUTPUT_BUDGET = 10
const TIMEOUT_MS = 20
const DOUBLE_OUTPUT_BUDGET = 20
const ASCII_A = 65

function deferred<T>() {
  return Promise.withResolvers<T>()
}

function expectRecovered(
  controller: ReturnType<typeof createPublicationController>
): void {
  expect(controller.getMetrics().active).toBe(0)
  expect(controller.getMetrics().reservedBytes).toBe(0)
}

describe('publication admission', () => {
  it('holds producer capacity through late completion after abort', async () => {
    const controller = createPublicationController(limits)
    const pending = deferred<Response>()
    const abort = new AbortController()
    const first = controller.runPublication({
      kind: 'sitemap',
      signal: abort.signal,
      timeoutMs: 1000,
      maxOutputBytes: OUTPUT_BUDGET,
      run: () => pending.promise
    })
    await Promise.resolve()
    abort.abort()
    await expect(first).resolves.toHaveProperty(
      'status',
      HTTP_INTERNAL_SERVER_ERROR
    )
    expect(controller.getMetrics().active).toBe(1)
    const rejected = await controller.runPublication({
      kind: 'sitemap',
      timeoutMs: 1000,
      maxOutputBytes: OUTPUT_BUDGET,
      run: () => Response.json({ ok: true })
    })
    expect(rejected.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    expect(rejected.headers.get('retry-after')).toBe('1')
    pending.resolve(new Response('late'))
    await pending.promise
    await Promise.resolve()
    expect(controller.getMetrics().active).toBe(0)
  })

  it('reserves output until the consumer finishes', async () => {
    const controller = createPublicationController(limits)
    const first = await controller.runPublication({
      kind: 'markdown',
      timeoutMs: 1000,
      maxOutputBytes: OUTPUT_BUDGET,
      run: () =>
        new Response('first', { headers: { 'content-type': 'text/markdown' } })
    })
    expect(controller.getMetrics().outputs).toBe(1)
    const rejected = await controller.runPublication({
      kind: 'markdown',
      timeoutMs: 1000,
      maxOutputBytes: OUTPUT_BUDGET,
      run: () =>
        new Response('second', { headers: { 'content-type': 'text/markdown' } })
    })
    expect(rejected.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    await expect(first.text()).resolves.toBe('first')
    expect(controller.getMetrics().outputs).toBe(0)
  })

  it('releases a source after synchronous throw and does not queue another', async () => {
    const controller = createPublicationController(limits)
    const key = {}
    const response = await controller.runPublication({
      kind: 'sitemap',
      timeoutMs: 1000,
      maxOutputBytes: OUTPUT_BUDGET,
      run: async ({ readSource }) => {
        await expect(
          readSource({
            key,
            run: () => {
              throw new Error('source')
            }
          })
        ).rejects.toThrow('source')
        return new Response('ok')
      }
    })
    await expect(response.text()).resolves.toBe('ok')
    expect(controller.getMetrics().sources).toBe(0)
  })

  it('refuses source work from a context whose publication already completed', async () => {
    const controller = createPublicationController(limits)
    const captured = deferred<PublicationContext>()
    const run = vi.fn<() => string>(() => 'late')
    await controller.runPublication({
      kind: 'sitemap',
      timeoutMs: 1000,
      maxOutputBytes: OUTPUT_BUDGET,
      run: context => {
        captured.resolve(context)
        return new Response(null)
      }
    })
    const context = await captured.promise

    expectRecovered(controller)
    expect(() => context.readSource({ key: {}, run })).toThrow(
      'Publication already completed'
    )
    expect(run).not.toHaveBeenCalled()
    expect(controller.getMetrics().sources).toBe(0)
  })
})

describe('publication lifecycle', () => {
  it('keeps the reservation until a late body is canceled', async () => {
    const controller = createPublicationController(limits)
    const late = deferred<Response>()
    const canceled = Promise.withResolvers<undefined>()
    const abort = new AbortController()
    const first = controller.runPublication({
      kind: 'sitemap',
      signal: abort.signal,
      timeoutMs: 1000,
      maxOutputBytes: OUTPUT_BUDGET,
      run: () => late.promise
    })
    abort.abort()
    await expect(first).resolves.toHaveProperty(
      'status',
      HTTP_INTERNAL_SERVER_ERROR
    )
    late.resolve(
      new Response(
        new ReadableStream({
          cancel() {
            return canceled.promise
          }
        })
      )
    )
    await late.promise
    await Promise.resolve()
    expect(controller.getMetrics().reservedBytes).toBe(OUTPUT_BUDGET)
    canceled.resolve(void 0)
    await canceled.promise
    await vi.waitFor(() =>
      expect(controller.getMetrics().reservedBytes).toBe(0)
    )
  })

  it('keeps parent capacity until a known detached child settles', async () => {
    const controller = createPublicationController(limits)
    const source = deferred<string>()
    const key = {}
    const response = await controller.runPublication({
      kind: 'sitemap',
      timeoutMs: 1000,
      maxOutputBytes: OUTPUT_BUDGET,
      run: ({ readSource }) => {
        void readSource({ key, run: () => source.promise })
        return new Response(null)
      }
    })
    expect(response.status).toBe(HTTP_OK)
    expect(controller.getMetrics().active).toBe(1)
    source.resolve('done')
    await source.promise
    await Promise.resolve()
    expect(controller.getMetrics().active).toBe(0)
  })

  it('enforces total and per-source quotas without a queue across classes', async () => {
    const controller = createPublicationController({
      ...limits,
      total: 2,
      outputs: 2,
      reservedBytes: DOUBLE_OUTPUT_BUDGET
    })
    const source = deferred<string>()
    const key = {}
    const first = controller.runPublication({
      kind: 'sitemap',
      timeoutMs: 1000,
      maxOutputBytes: OUTPUT_BUDGET,
      run: async ({ readSource }) => {
        await readSource({ key, run: () => source.promise })
        return new Response(null)
      }
    })
    const second = await controller.runPublication({
      kind: 'markdown',
      timeoutMs: 1000,
      maxOutputBytes: OUTPUT_BUDGET,
      run: async ({ readSource }) => {
        await readSource({ key, run: () => 'unreachable' })
        return new Response(null)
      }
    })
    expect(second.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    expect(controller.getMetrics().sources).toBe(1)
    source.resolve('done')
    await expect(first).resolves.toHaveProperty('status', HTTP_OK)
  })

  it('keeps late rejection accounted and handles synchronous producer throw', async () => {
    const controller = createPublicationController(limits)
    const late = deferred<Response>()
    const abort = new AbortController()
    const first = controller.runPublication({
      kind: 'sitemap',
      signal: abort.signal,
      timeoutMs: 1000,
      maxOutputBytes: OUTPUT_BUDGET,
      run: () => late.promise
    })
    abort.abort()
    await first
    late.reject(new Error('late'))
    await expect(late.promise).rejects.toThrow('late')
    await Promise.resolve()
    expect(controller.getMetrics().active).toBe(0)
    await expect(
      controller.runPublication({
        kind: 'sitemap',
        timeoutMs: 1000,
        maxOutputBytes: OUTPUT_BUDGET,
        run: () => {
          throw new Error('sync')
        }
      })
    ).rejects.toThrow('sync')
    expect(controller.getMetrics().active).toBe(0)
    expect(controller.getMetrics().outputs).toBe(0)
  })

  it('waits for asynchronous HEAD cancellation before releasing bytes', async () => {
    const controller = createPublicationController(limits)
    const canceled = Promise.withResolvers<undefined>()
    const pending = controller.runPublication({
      kind: 'sitemap',
      method: 'HEAD',
      timeoutMs: 1000,
      maxOutputBytes: OUTPUT_BUDGET,
      run: () =>
        new Response(
          new ReadableStream({
            cancel() {
              return canceled.promise
            }
          })
        )
    })
    await Promise.resolve()
    expect(controller.getMetrics().reservedBytes).toBe(OUTPUT_BUDGET)
    canceled.resolve(void 0)
    await expect(pending).resolves.toHaveProperty('body', null)
    expect(controller.getMetrics().reservedBytes).toBe(0)
  })

  it('errors the delivered body on abort and retains bytes through slow cancellation', async () => {
    const controller = createPublicationController(limits)
    const canceled = Promise.withResolvers<undefined>()
    const abort = new AbortController()
    const response = await controller.runPublication({
      kind: 'sitemap',
      signal: abort.signal,
      timeoutMs: 1000,
      maxOutputBytes: OUTPUT_BUDGET,
      run: () =>
        new Response(
          new ReadableStream({
            pull(target) {
              target.enqueue(new Uint8Array([ASCII_A]))
            },
            cancel() {
              return canceled.promise
            }
          })
        )
    })
    if (!response.body) throw new Error('Expected publication body')
    const reader = response.body.getReader()
    const chunk = await reader.read()
    expect(chunk.value).toStrictEqual(new Uint8Array([ASCII_A]))
    abort.abort()
    await expect(reader.read()).rejects.toBeDefined()
    expect(controller.getMetrics().reservedBytes).toBe(OUTPUT_BUDGET)
    const rejected = await controller.runPublication({
      kind: 'sitemap',
      timeoutMs: 1000,
      maxOutputBytes: OUTPUT_BUDGET,
      run: () => new Response(null)
    })
    expect(rejected.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    canceled.resolve(void 0)
    await canceled.promise
    await vi.waitFor(() =>
      expect(controller.getMetrics().reservedBytes).toBe(0)
    )
  })
})

describe('publication byte budget', () => {
  it('accepts the exact byte budget and errors at budget plus one', async () => {
    const controller = createPublicationController(limits)
    const exact = await controller.runPublication({
      kind: 'sitemap',
      timeoutMs: 1000,
      maxOutputBytes: 3,
      run: () => new Response('abc')
    })
    await expect(exact.text()).resolves.toBe('abc')
    const excess = await controller.runPublication({
      kind: 'sitemap',
      timeoutMs: 1000,
      maxOutputBytes: 3,
      run: () => new Response('abcd')
    })
    await expect(excess.text()).rejects.toThrow(
      'Publication output limit exceeded'
    )
    await Promise.resolve()
    expect(controller.getMetrics().reservedBytes).toBe(0)
  })
})

describe('publication deadlines and configuration', () => {
  it('holds a non-cooperative producer after timeout and releases on settlement', async () => {
    vi.useFakeTimers()
    try {
      const controller = createPublicationController(limits)
      const source = deferred<Response>()
      const pending = controller.runPublication({
        kind: 'sitemap',
        timeoutMs: TIMEOUT_MS,
        maxOutputBytes: OUTPUT_BUDGET,
        run: () => source.promise
      })
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS)
      const timedOut = await pending
      expect(timedOut.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
      expect(timedOut.headers.get('cache-control')).toBe('no-store')
      expect(controller.getMetrics().active).toBe(1)
      const rejected = await controller.runPublication({
        kind: 'sitemap',
        timeoutMs: TIMEOUT_MS,
        maxOutputBytes: OUTPUT_BUDGET,
        run: () => new Response(null)
      })
      expect(rejected.status).toBe(HTTP_SERVICE_UNAVAILABLE)
      source.resolve(new Response(null))
      await source.promise
      await vi.advanceTimersByTimeAsync(0)
      expectRecovered(controller)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retains output through deadline during delivery and errors the stream', async () => {
    vi.useFakeTimers()
    try {
      const controller = createPublicationController(limits)
      const canceled = Promise.withResolvers<undefined>()
      const response = await controller.runPublication({
        kind: 'sitemap',
        timeoutMs: TIMEOUT_MS,
        maxOutputBytes: OUTPUT_BUDGET,
        run: () =>
          new Response(
            new ReadableStream({
              pull(target) {
                target.enqueue(new Uint8Array([ASCII_A]))
              },
              cancel() {
                return canceled.promise
              }
            })
          )
      })
      if (!response.body) throw new Error('Expected publication body')
      const reader = response.body.getReader()
      await reader.read()
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS)
      await expect(reader.read()).rejects.toBeDefined()
      expect(controller.getMetrics().reservedBytes).toBe(OUTPUT_BUDGET)
      canceled.resolve(void 0)
      await vi.advanceTimersByTimeAsync(0)
      expect(controller.getMetrics().reservedBytes).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('captures limit configuration instead of observing later mutation', async () => {
    const mutable = { ...limits }
    const controller = createPublicationController(mutable)
    mutable.total = 100
    mutable.outputs = 100
    const pending = deferred<Response>()
    const first = controller.runPublication({
      kind: 'sitemap',
      timeoutMs: 1000,
      maxOutputBytes: OUTPUT_BUDGET,
      run: () => pending.promise
    })
    const rejected = await controller.runPublication({
      kind: 'markdown',
      timeoutMs: 1000,
      maxOutputBytes: OUTPUT_BUDGET,
      run: () => new Response(null)
    })
    expect(rejected.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    pending.resolve(new Response(null))
    await first
  })
})

describe('source and HEAD cancellation', () => {
  it('keeps source and parent capacity after timeout until the source settles', async () => {
    vi.useFakeTimers()
    try {
      const controller = createPublicationController(limits)
      const source = deferred<string>()
      const key = {}
      const pending = controller.runPublication({
        kind: 'sitemap',
        timeoutMs: TIMEOUT_MS,
        maxOutputBytes: OUTPUT_BUDGET,
        run: async ({ readSource }) => {
          await readSource({ key, run: () => source.promise })
          return new Response(null)
        }
      })
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS)
      await expect(pending).resolves.toHaveProperty(
        'status',
        HTTP_INTERNAL_SERVER_ERROR
      )
      expect(controller.getMetrics().sources).toBe(1)
      expect(controller.getMetrics().active).toBe(1)
      source.resolve('done')
      await vi.advanceTimersByTimeAsync(0)
      expectRecovered(controller)
      expect(controller.getMetrics().sources).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns the deadline error for HEAD while slow body cancellation still owns bytes', async () => {
    vi.useFakeTimers()
    try {
      const controller = createPublicationController(limits)
      const canceled = Promise.withResolvers<undefined>()
      const pending = controller.runPublication({
        kind: 'sitemap',
        method: 'HEAD',
        timeoutMs: TIMEOUT_MS,
        maxOutputBytes: OUTPUT_BUDGET,
        run: () =>
          new Response(
            new ReadableStream({
              cancel() {
                return canceled.promise
              }
            })
          )
      })
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS)
      await expect(pending).resolves.toHaveProperty(
        'status',
        HTTP_INTERNAL_SERVER_ERROR
      )
      expect(controller.getMetrics().reservedBytes).toBe(OUTPUT_BUDGET)
      canceled.resolve(void 0)
      await vi.advanceTimersByTimeAsync(0)
      expect(controller.getMetrics().reservedBytes).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('publication cancellation metrics', () => {
  it.each(['sitemap', 'markdown'] as const)(
    'records pre-admission abort for %s without starting work',
    async kind => {
      const controller = createPublicationController(limits)
      const client = new AbortController()
      client.abort()
      const run = vi.fn<() => Response>(() => new Response(null))
      const response = await controller.runPublication({
        kind,
        signal: client.signal,
        timeoutMs: TIMEOUT_MS,
        maxOutputBytes: OUTPUT_BUDGET,
        run
      })
      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
      expect(run).not.toHaveBeenCalled()
      expect(controller.getMetrics()).toMatchObject({
        active: 0,
        aborted: 1,
        timedOut: 0,
        reservedBytes: 0
      })
    }
  )
})
