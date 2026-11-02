/* v8 ignore file -- Fixture de teste fora da cobertura da aplicação. */
import { createRequestEvent, type RequestEvent } from '@solidjs/web'

import { createPublicationController } from '@/infra/server/publication/index.ts'
import type { PublicationLimits } from '@/infra/server/publication/types.ts'
import { Router } from '@/router.ts'

import { markdownContent as productionMarkdownContent } from '../index.ts'

const HTTP_OK = 200

type Options = {
  path?: string
  accept?: string
  method?: string
  signal?: AbortSignal
}

const TEST_RESERVED_BYTES = 16_777_216

const testLimits: PublicationLimits = {
  total: 4,
  sitemap: 2,
  markdown: 2,
  sources: 4,
  perSource: 2,
  outputs: 4,
  reservedBytes: TEST_RESERVED_BYTES
}
let publicationController: ReturnType<typeof createPublicationController>
let openResponses: Response[]

vi.mock(import('@/infra/server/publication/index.ts'), async importOriginal => {
  const original = await importOriginal()
  return {
    ...original,
    runPublication: (options: Parameters<typeof original.runPublication>[0]) =>
      publicationController.runPublication(options)
  }
})

export async function markdownContent(
  request: RequestEvent,
  render: Parameters<typeof productionMarkdownContent>[1]
): Promise<Response> {
  const response = await productionMarkdownContent(request, render)
  openResponses.push(response)
  return response
}

export function event({
  path = '/en/about',
  accept = 'text/markdown',
  method = 'GET',
  signal
}: Options = {}): RequestEvent {
  const request = createRequestEvent(
    new Request(`https://example.com${path}`, {
      method,
      headers: { accept },
      signal
    })
  )
  request.locals.ssrRenderState = { hasErrors: false, hasCompleted: true }
  return request
}

export function html(
  body = '<main><h1>Title</h1><p>Public content</p></main>',
  status = HTTP_OK
): Promise<Response> {
  return Promise.resolve(
    new Response(body, {
      status,
      headers: { 'content-type': 'text/html', vary: 'Cookie' }
    })
  )
}

export function mockPublishedRoute(): void {
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
}

export function resetPublicationController(): void {
  publicationController = createPublicationController(testLimits)
  openResponses = []
}

export async function cancelOpenResponses(): Promise<void> {
  for (const response of openResponses) {
    try {
      await response.body?.cancel()
    } catch {
      /* Already consumed. */
    }
  }
}

export function getPublicationMetrics(): ReturnType<
  typeof publicationController.getMetrics
> {
  return publicationController.getMetrics()
}
