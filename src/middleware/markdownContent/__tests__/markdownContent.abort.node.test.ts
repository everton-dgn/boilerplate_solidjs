import {
  createComponent,
  createRequestEvent,
  type RequestEvent,
  renderToStream,
  ssr
} from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'
import { createMemo, Loading, onCleanup } from 'solid-js'

import { HTTP_INTERNAL_SERVER_ERROR } from '@/constants/http.ts'
import { protectServerOperation } from '@/infra/server/protectServerOperation/index.ts'
import {
  createPublicationController,
  getPublicationMetrics
} from '@/infra/server/publication/index.ts'
import type { PublicationLimits } from '@/infra/server/publication/types.ts'
import { Router } from '@/router.ts'
import { readLog } from '@/tests/helpers/readLog/index.ts'

import { createMiddleware } from '../../index.ts'
import { MARKDOWN_TIMEOUT_MS } from '../constants.ts'
import { markdownContent } from '../index.ts'

type ComposedRender = (event: RequestEvent) => Promise<Response>
type ComposedOptions = { client: AbortController; render: ComposedRender }
type Cancellation = (client: AbortController) => Promise<void>
type NativeCancellation = { shouldAbortBeforeAwait: boolean; reason: unknown }

const NATIVE_CANCELLATIONS: NativeCancellation[] = [true, false].flatMap(
  shouldAbortBeforeAwait =>
    [new Error('client disconnected'), null, false, 0, '', Number.NaN, -0].map(
      reason => ({
        shouldAbortBeforeAwait,
        reason
      })
    )
)
const DRAIN_MS = 100
const OUTPUT_BYTES = 100
const LOG_MESSAGE = '[middleware] Unexpected failure; private details omitted'
const LIMITS: PublicationLimits = {
  total: 1,
  sitemap: 1,
  markdown: 1,
  sources: 1,
  perSource: 1,
  outputs: 1,
  reservedBytes: 1024
}
const CANCELLATIONS: [string, Cancellation][] = [
  [
    'a client disconnect without a reason',
    client => {
      client.abort()
      return Promise.resolve()
    }
  ],
  [
    'a client disconnect with its own reason',
    client => {
      client.abort(new Error('PRIVATE_CLIENT'))
      return Promise.resolve()
    }
  ],
  [
    'the publication deadline',
    async () => {
      await vi.advanceTimersByTimeAsync(MARKDOWN_TIMEOUT_MS)
    }
  ]
]

function pendingFragment(pending: Promise<string>) {
  const value = createMemo(() => pending)
  return ssr(
    ['<p>', '</p>'],
    createMemo(() => value())
  )
}

function pendingPage(cleanup: () => void) {
  onCleanup(cleanup)
  return ssr(
    ['<main>', '</main>'],
    createComponent(Loading, {
      fallback: 'Waiting',
      get children() {
        const value = createMemo(() => Promise.withResolvers<string>().promise)
        return ssr(
          ['<p>', '</p>'],
          createMemo(() => value())
        )
      }
    })
  )
}

function startComposedMarkdown({
  client,
  render
}: ComposedOptions): Promise<Response> {
  vi.spyOn(Router, 'match').mockReturnValue([
    {
      path: '/about',
      pattern: '/about',
      match: '/about',
      params: {},
      info: { markdown: true }
    }
  ])
  const event = createRequestEvent(
    new Request('https://example.com/en/about.md', {
      signal: client.signal,
      headers: { accept: 'text/markdown' }
    })
  )
  return Promise.resolve(
    provideRequestEvent(event, () =>
      createMiddleware()(event, () => render(event))
    )
  )
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  const aborted = Promise.withResolvers<undefined>()
  signal.addEventListener('abort', () => aborted.resolve(void 0), {
    once: true
  })
  return aborted.promise
}

// A resposta do adaptador sai antes de a cadeia interna assentar; a vaga só é
// liberada depois dela, então a ausência de log não passa por adiantamento.
async function expectReleasedPublication(): Promise<void> {
  await vi.waitFor(() =>
    expect(getPublicationMetrics()).toMatchObject({
      active: 0,
      outputs: 0,
      reservedBytes: 0
    })
  )
}

describe('native SSR abandonment', () => {
  it('disposes the root but retains capacity until the registered backend settles', async () => {
    vi.useFakeTimers()
    try {
      const backend = Promise.withResolvers<string>()
      const client = new AbortController()
      const publication = createPublicationController(LIMITS)
      const cleanup = vi.fn<() => void>()
      const pending = publication.runPublication({
        kind: 'markdown',
        signal: client.signal,
        timeoutMs: DRAIN_MS,
        maxOutputBytes: OUTPUT_BYTES,
        run: async ({ signal }) => {
          const html = await renderToStream(
            () => {
              onCleanup(cleanup)
              return ssr(
                ['<main>', '</main>'],
                createComponent(Loading, {
                  fallback: 'Waiting',
                  get children() {
                    return pendingFragment(
                      protectServerOperation({ run: () => backend.promise })
                    )
                  }
                })
              )
            },
            { signal }
          )
          return new Response(html)
        }
      })
      client.abort()
      await expect(pending).resolves.toHaveProperty(
        'status',
        HTTP_INTERNAL_SERVER_ERROR
      )
      expect(cleanup).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(0)
      expect(publication.getMetrics().active).toBe(1)
      backend.resolve('done')
      await vi.advanceTimersByTimeAsync(DRAIN_MS)
      expect(publication.getMetrics()).toMatchObject({
        active: 0,
        reservedBytes: 0,
        timedOut: 0
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('disposes a pending native SSR root when its signal aborts', async () => {
    const controller = new AbortController()
    vi.stubEnv('DEV', false)
    vi.spyOn(Router, 'match').mockReturnValue([
      {
        path: '/about',
        pattern: '/about',
        match: '/about',
        params: {},
        info: { markdown: true }
      }
    ])
    const request = createRequestEvent(
      new Request('https://example.com/en/about.md', {
        signal: controller.signal
      })
    )
    const cleanup = vi.fn<() => void>()
    const render = async () => {
      const result = await renderToStream(() => pendingPage(cleanup), {
        signal: request.request.signal
      })
      return new Response(result, {
        headers: { 'content-type': 'text/html' }
      })
    }
    const pending = markdownContent(request, render)
    expect(cleanup).not.toHaveBeenCalled()
    controller.abort()
    const response = await pending
    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    expect(cleanup).toHaveBeenCalledOnce()
  })
})

describe('composed middleware cancellation', () => {
  beforeAll(async () => {
    await import('@/infra/server/configureServerErrors/index.ts')
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockImplementation(vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(CANCELLATIONS)(
    'keeps the public response without a failure log after %s',
    async (_label, cancel) => {
      const client = new AbortController()
      const started = Promise.withResolvers<undefined>()
      const cleanup = vi.fn<() => void>()
      const pending = startComposedMarkdown({
        client,
        render: async event => {
          const rendered = renderToStream(() => pendingPage(cleanup), {
            signal: event.request.signal
          })
          started.resolve(void 0)
          return new Response(await rendered, {
            headers: { 'content-type': 'text/html' }
          })
        }
      })
      await started.promise

      await cancel(client)
      const response = await pending

      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      await expectReleasedPublication()
      expect(cleanup).toHaveBeenCalledOnce()
      expect(console.error).not.toHaveBeenCalled()
    }
  )

  it.each(CANCELLATIONS)(
    'logs a distinct failure raised during %s',
    async (_label, cancel) => {
      const client = new AbortController()
      const started = Promise.withResolvers<undefined>()
      const pending = startComposedMarkdown({
        client,
        render: async event => {
          started.resolve(void 0)
          await waitForAbort(event.request.signal)
          throw new TypeError('PRIVATE_DISTINCT')
        }
      })
      await started.promise

      await cancel(client)
      const response = await pending

      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
      await expectReleasedPublication()
      expect(readLog(console.error)).toStrictEqual({
        heads: [[LOG_MESSAGE, 'TypeError']],
        leaks: []
      })
    }
  )
})

describe('native async render cancellation contract', () => {
  it.each(NATIVE_CANCELLATIONS)(
    'settles all consumers when abort precedes awaiting: $shouldAbortBeforeAwait, reason: $reason',
    async ({ shouldAbortBeforeAwait, reason }) => {
      const client = new AbortController()
      const complete = vi.fn<() => void>()
      const cleanup = vi.fn<() => void>()
      const rendered = renderToStream(() => pendingPage(cleanup), {
        signal: client.signal,
        onCompleteAll: complete
      })
      if (shouldAbortBeforeAwait) client.abort(reason)
      const pending = Promise.allSettled([
        Promise.resolve(rendered),
        Promise.resolve(rendered)
      ])
      await Promise.resolve()
      client.abort(reason)
      await expect(pending).resolves.toStrictEqual([
        { status: 'rejected', reason },
        { status: 'rejected', reason }
      ])
      expect(cleanup).toHaveBeenCalledOnce()
      expect(complete).not.toHaveBeenCalled()
    }
  )
})
