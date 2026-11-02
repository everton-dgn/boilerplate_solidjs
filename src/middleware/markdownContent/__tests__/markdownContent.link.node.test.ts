import { createRequestEvent, type RequestEvent } from '@solidjs/web'

import { LLMS_DESCRIBEDBY_LINK } from '@/constants/llms.ts'
import { createPublicationController } from '@/infra/server/publication/index.ts'
import type { PublicationLimits } from '@/infra/server/publication/types.ts'
import { Router } from '@/router.ts'

import { markdownContent as productionMarkdownContent } from '../index.ts'

const HTTP_OK = 200
const HTTP_REDIRECT = 307
const HTTP_NOT_FOUND = 404
const HTTP_NOT_ACCEPTABLE = 406
const HTTP_SERVER_ERROR = 500
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
type EventOptions = { path?: string; accept?: string; method?: string }

vi.mock(import('@/infra/server/publication/index.ts'), async importOriginal => {
  const original = await importOriginal()
  return {
    ...original,
    runPublication: (options: Parameters<typeof original.runPublication>[0]) =>
      publicationController.runPublication(options)
  }
})

async function markdownContent(
  request: RequestEvent,
  render: Parameters<typeof productionMarkdownContent>[1]
): Promise<Response> {
  const response = await productionMarkdownContent(request, render)
  openResponses.push(response)
  return response
}

function event({
  path = '/en/about',
  accept = 'text/markdown',
  method = 'GET'
}: EventOptions = {}): RequestEvent {
  const request = createRequestEvent(
    new Request(`https://example.com${path}`, {
      method,
      headers: { accept }
    })
  )
  request.locals.ssrRenderState = { hasErrors: false, hasCompleted: true }
  return request
}

function html(
  body = '<main><h1>Title</h1></main>',
  status = HTTP_OK
): Promise<Response> {
  return Promise.resolve(
    new Response(body, {
      status,
      headers: { 'content-type': 'text/html', vary: 'Cookie' }
    })
  )
}

function mockPublishedRoute(): void {
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

async function cancelOpenResponses(): Promise<void> {
  for (const response of openResponses) {
    try {
      await response.body?.cancel()
    } catch {
      /* Already consumed. */
    }
  }
}

describe('HTTP Link discovery', () => {
  beforeEach(() => {
    publicationController = createPublicationController(testLimits)
    openResponses = []
    mockPublishedRoute()
  })
  afterEach(cancelOpenResponses)

  it('appends the llms.txt describedby link to converted Markdown', async () => {
    for (const path of ['/en/about.md', '/en/about']) {
      const response = await markdownContent(event({ path }), () => html())
      expect(response.status).toBe(HTTP_OK)
      expect(response.headers.get('link')).toBe(LLMS_DESCRIBEDBY_LINK)
      expect(response.headers.get('vary')).toBe('Cookie, Accept')
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    }
  })

  it('composes the describedby link after a Link from the render', async () => {
    const preload = '</assets/app.css>; rel=preload; as=style'
    const response = await markdownContent(event(), () =>
      Promise.resolve(
        new Response('<main><h1>Title</h1></main>', {
          headers: { 'content-type': 'text/html', link: preload }
        })
      )
    )
    expect(response.headers.get('link')).toBe(
      `${preload}, ${LLMS_DESCRIBEDBY_LINK}`
    )
  })

  it('sends the same status and headers on HEAD and GET', async () => {
    const get = await markdownContent(event({ path: '/en/about.md' }), () =>
      html()
    )
    const head = await markdownContent(
      event({ method: 'HEAD', path: '/en/about.md' }),
      () => html()
    )
    expect(head.status).toBe(get.status)
    expect(Object.fromEntries(head.headers)).toStrictEqual(
      Object.fromEntries(get.headers)
    )
    expect(head.headers.get('link')).toBe(LLMS_DESCRIBEDBY_LINK)
    await expect(head.text()).resolves.toBe('')
  })

  it('does not announce the index on Markdown errors, refusals or redirects', async () => {
    const responses = [
      await markdownContent(event(), () =>
        html('<main><h1>Not found</h1></main>', HTTP_NOT_FOUND)
      ),
      await markdownContent(event({ accept: 'application/json' }), () =>
        html()
      ),
      await markdownContent(event({ path: '/en/about.md' }), () =>
        Promise.resolve(
          new Response(null, {
            status: HTTP_REDIRECT,
            headers: { location: '/en/contact' }
          })
        )
      ),
      await markdownContent(event({ path: '/en/about.md' }), () =>
        Promise.resolve(
          new Response('<main>Private</main>', {
            headers: {
              'content-type': 'text/html',
              'x-robots-tag': 'noindex'
            }
          })
        )
      )
    ]
    const incomplete = event()
    incomplete.locals.ssrRenderState = {
      hasErrors: false,
      hasCompleted: false
    }
    responses.push(await markdownContent(incomplete, () => html()))
    expect(responses.map(response => response.status)).toStrictEqual([
      HTTP_NOT_FOUND,
      HTTP_NOT_ACCEPTABLE,
      HTTP_REDIRECT,
      HTTP_NOT_FOUND,
      HTTP_SERVER_ERROR
    ])
    for (const response of responses) {
      expect(response.headers.has('link')).toBe(false)
    }
  })
})
