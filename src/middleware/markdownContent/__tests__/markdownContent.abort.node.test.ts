import {
  createComponent,
  createRequestEvent,
  renderToStream,
  ssr
} from '@solidjs/web'
import { createMemo, Loading, onCleanup } from 'solid-js'

import { HTTP_INTERNAL_SERVER_ERROR } from '@/constants/http.ts'
import { protectServerOperation } from '@/infra/server/protectServerOperation/index.ts'
import { createPublicationController } from '@/infra/server/publication/index.ts'
import type { PublicationLimits } from '@/infra/server/publication/types.ts'
import { Router } from '@/router.ts'

import { markdownContent } from '../index.ts'

const DRAIN_MS = 100
const OUTPUT_BYTES = 100
const LIMITS: PublicationLimits = {
  total: 1,
  sitemap: 1,
  markdown: 1,
  sources: 1,
  perSource: 1,
  outputs: 1,
  reservedBytes: 1024
}

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

describe('native async render cancellation contract', () => {
  it.each([true, false])(
    'settles all consumers when abort precedes awaiting: %s',
    async shouldAbortBeforeAwait => {
      const client = new AbortController()
      const complete = vi.fn<() => void>()
      const cleanup = vi.fn<() => void>()
      const rendered = renderToStream(() => pendingPage(cleanup), {
        signal: client.signal,
        onCompleteAll: complete
      })
      const reason = new Error('client disconnected')
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
