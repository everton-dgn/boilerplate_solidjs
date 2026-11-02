import { createRequestEvent, type RequestEvent } from '@solidjs/web'

import { SITE } from '@/constants/site/index.ts'
import { Router } from '@/router.ts'

import { MARKDOWN_PRERENDER_PATH } from '../constants.ts'
import { collectStaticMarkdownPages } from '../helpers/collectStaticMarkdownPages/index.ts'
import {
  markdownContent,
  event,
  html,
  mockPublishedRoute,
  resetPublicationController,
  cancelOpenResponses
} from './fixtures.ts'

const HTTP_OK = 200
const HTTP_MOVED_PERMANENTLY = 301
const HTTP_FOUND = 302
const HTTP_SEE_OTHER = 303
const HTTP_REDIRECT = 307
const HTTP_PERMANENT_REDIRECT = 308
const HTTP_NOT_FOUND = 404
const HTTP_SERVER_ERROR = 500

vi.mock(import('../helpers/collectStaticMarkdownPages/index.ts'), () => ({
  collectStaticMarkdownPages: vi.fn<() => string[]>(() => [
    '/pt',
    '/en/about',
    '/en/private'
  ])
}))

function prerender(path: string): RequestEvent {
  return createRequestEvent(
    new Request(`https://example.com${path}`, {
      headers: { 'x-nitro-prerender': path }
    })
  )
}

describe('build-time Markdown', () => {
  beforeEach(resetPublicationController)
  afterEach(cancelOpenResponses)

  it.each([
    HTTP_MOVED_PERMANENTLY,
    HTTP_FOUND,
    HTTP_SEE_OTHER,
    HTTP_REDIRECT,
    HTTP_PERMANENT_REDIRECT
  ])(
    'fails the prerender instead of publishing an HTTP %s redirect body',
    async status => {
      mockPublishedRoute()
      const cancel = vi.fn<() => void>()
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('Redirect body'))
        },
        cancel
      })
      const response = await markdownContent(prerender('/en/about.md'), () =>
        Promise.resolve(
          new Response(body, {
            status,
            headers: { location: '/en/contact' }
          })
        )
      )
      expect(response.status).toBe(HTTP_SERVER_ERROR)
      expect(response.headers.has('location')).toBe(false)
      await expect(response.text()).resolves.not.toContain('Redirect body')
      expect(cancel).toHaveBeenCalledOnce()
    }
  )

  it('lists the publishable static pages for the build prerender', async () => {
    vi.spyOn(Router, 'match').mockImplementation(href => {
      const { pathname } = new URL(href)
      return [
        {
          path: pathname,
          pattern: pathname,
          match: pathname,
          params: {},
          info: {
            markdown: true,
            seo: { noindex: pathname === '/en/private' }
          }
        }
      ]
    })
    const next = vi.fn<() => Promise<Response>>(() => html())
    const response = await markdownContent(
      prerender(MARKDOWN_PRERENDER_PATH),
      next
    )
    expect(next).not.toHaveBeenCalled()
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    await expect(response.json()).resolves.toStrictEqual({
      siteUrl: new URL('/', SITE.url).href,
      baseLocale: 'en',
      paths: ['/pt/index.md', '/en/about.md'],
      baseLocalePaths: ['/en/about.md'],
      mismatches: []
    })
  })

  it('reports static opt-ins that the matcher resolves to another route', async () => {
    vi.spyOn(Router, 'match').mockImplementation(href => {
      const { pathname } = new URL(href)
      return [
        {
          path: pathname,
          pattern: pathname,
          match: pathname,
          params: {},
          info: { markdown: pathname === '/en/about' ? 'dynamic' : true }
        }
      ]
    })
    const response = await markdownContent(
      prerender(MARKDOWN_PRERENDER_PATH),
      () => html()
    )
    await expect(response.json()).resolves.toMatchObject({
      paths: ['/pt/index.md', '/en/private.md'],
      mismatches: ['/en/about']
    })
  })

  it('keeps the listing path private outside the prerender', async () => {
    const original = new Response('missing', { status: HTTP_NOT_FOUND })
    const response = await markdownContent(
      event({ path: MARKDOWN_PRERENDER_PATH, accept: 'application/json' }),
      () => Promise.resolve(original)
    )
    expect(response).toBe(original)
  })

  it('does not rebuild the listing from a public header in production', async () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('PUBLICATION_BUILD_PHASE', '')
    const original = new Response('missing', { status: HTTP_NOT_FOUND })
    const next = vi.fn<() => Promise<Response>>(() => Promise.resolve(original))
    vi.mocked(collectStaticMarkdownPages).mockClear()
    try {
      const response = await markdownContent(
        prerender(MARKDOWN_PRERENDER_PATH),
        next
      )
      expect(response).toBe(original)
      expect(next).toHaveBeenCalledOnce()
      expect(collectStaticMarkdownPages).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('converts a dynamic page on request', async () => {
    vi.spyOn(Router, 'match').mockReturnValue([
      {
        path: '/blog',
        pattern: '/blog',
        match: '/blog',
        params: {},
        info: { markdown: 'dynamic' }
      }
    ])
    const response = await markdownContent(event({ path: '/en/blog.md' }), () =>
      html()
    )
    expect(response.status).toBe(HTTP_OK)
    expect(response.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    )
    await expect(response.text()).resolves.toContain('# Title')
  })
})
