import type { FileRouteEntry, FileRouteTreeEntry } from 'virtual:file-routes'

import type { SitePage } from '@/@types/site-page.ts'

import { markdownContent } from '../index.ts'

type RequestOptions = { path?: string; accept?: string; method?: string }
type TestManifest = {
  default: readonly FileRouteEntry[]
  pageRoutes: readonly FileRouteTreeEntry[]
}

const ORIGIN = 'https://example.com'
const HTTP_OK = 200
const HTTP_NOT_FOUND = 404
const HTTP_NOT_ACCEPTABLE = 406
const HTTP_FAILURE = 500
const MINIMUM_ERROR_LENGTH = 20

const { readPageContent, readParentContent, readNewPageContent } = vi.hoisted(
  () => ({
    readPageContent: vi.fn<() => SitePage>(),
    readParentContent: vi.fn<() => SitePage>(),
    readNewPageContent: vi.fn<() => SitePage>()
  })
)

vi.mock(import('virtual:file-routes') as Promise<TestManifest>, () => ({
  default: [],
  pageRoutes: [
    {
      id: 'home',
      path: '/',
      $$route: {
        require: () => ({ route: { info: { content: readPageContent } } })
      }
    },
    {
      id: 'about',
      path: '/about',
      $$route: {
        require: () => ({ route: { info: { content: readPageContent } } })
      }
    },
    {
      id: 'guides',
      path: '/guides',
      $$route: {
        require: () => ({ route: { info: { content: readParentContent } } })
      },
      children: [
        {
          id: 'new-page',
          path: '/new-page',
          $$route: {
            require: () => ({
              route: { info: { content: readNewPageContent } }
            })
          }
        },
        { id: 'html-only', path: '/html-only' }
      ]
    }
  ]
}))

function mockPageContent(): void {
  const page: SitePage = {
    title: 'Example [site]',
    description: 'A useful description.',
    intro: 'Details about the project.',
    sections: [{ title: 'Use cases', paragraphs: ['Read public docs.'] }],
    links: [{ label: 'Public source', href: 'https://example.com/source' }]
  }
  readPageContent.mockReturnValue(page)
  readParentContent.mockReturnValue({ ...page, title: 'Parent page' })
  readNewPageContent.mockReturnValue({ ...page, title: 'New route guide' })
}

function pageRequest({
  path = '/pt',
  accept = 'text/markdown',
  method = 'GET'
}: RequestOptions = {}): Request {
  return new Request(new URL(path, ORIGIN), { method, headers: { accept } })
}

describe('markdown content', () => {
  beforeEach(mockPageContent)

  it.each([
    'application/json',
    'text/html;q=0, text/markdown;q=0',
    '*/*;q=0',
    ''
  ])('rejects an unacceptable representation: %s', async accept => {
    const next = vi.fn<() => Promise<Response>>()
    const response = await markdownContent(pageRequest({ accept }), next)
    expect(response.status).toBe(HTTP_NOT_ACCEPTABLE)
    expect(response.headers.get('vary')).toBe('Accept')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    await expect(response.text()).resolves.toBe('text/html\ntext/markdown\n')
    expect(next).not.toHaveBeenCalled()
  })

  it('omits a 406 body for HEAD', async () => {
    const next = vi.fn<() => Promise<Response>>()
    const response = await markdownContent(
      pageRequest({ accept: '*/*;q=0', method: 'HEAD' }),
      next
    )
    expect(response.status).toBe(HTTP_NOT_ACCEPTABLE)
    expect(response.body).toBeNull()
    expect(next).not.toHaveBeenCalled()
  })

  it.each(['/pt', '/pt/', '/en/about', '/es/about/'])(
    'serves a known page at %s without rendering HTML',
    async path => {
      const next = vi.fn<() => Promise<Response>>()
      const response = await markdownContent(pageRequest({ path }), next)
      expect(next).not.toHaveBeenCalled()
      expect(response.headers.get('content-type')).toBe(
        'text/markdown; charset=utf-8'
      )
      expect(response.headers.get('vary')).toBe('Accept')
      await expect(response.text()).resolves.toBe(
        '# Example \\[site\\]\n\nA useful description\\.\n\nDetails about the project\\.\n\n## Use cases\n\nRead public docs\\.\n\n- [Public source](<https://example.com/source>)\n'
      )
    }
  )

  it('returns the same representation headers and no body for HEAD', async () => {
    const next = vi.fn<() => Promise<Response>>()
    const response = await markdownContent(
      pageRequest({ method: 'HEAD' }),
      next
    )
    expect(response.body).toBeNull()
    expect(response.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    )
    expect(response.headers.get('vary')).toBe('Accept')
    expect(next).not.toHaveBeenCalled()
  })

  it('replaces an actual HTML 404 while discarding its body and stale representation headers', async () => {
    const cancel = vi.fn<() => void>()
    const original = new Response(new ReadableStream({ cancel }), {
      status: HTTP_NOT_FOUND,
      headers: {
        'content-type': 'Text/HTML; charset=utf-8',
        'content-length': '1000',
        'content-encoding': 'gzip',
        etag: 'html-version',
        'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
        vary: 'Cookie, Accept-Language',
        'x-robots-tag': 'noindex'
      }
    })
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(original)
    const response = await markdownContent(
      pageRequest({ path: '/pt/missing' }),
      next
    )
    expect(cancel).toHaveBeenCalledOnce()
    expect(response.status).toBe(HTTP_NOT_FOUND)
    expect(Object.fromEntries(response.headers)).toStrictEqual({
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'private, no-store',
      vary: 'Cookie, Accept-Language, Accept',
      'x-robots-tag': 'noindex'
    })
    const body = await response.text()
    expect(body).toMatch(/^# .+\n[\s\S]*\]\(\/llms\.txt\)\n$/u)
    expect(body.length).toBeGreaterThan(MINIMUM_ERROR_LENGTH)
  })

  it('preserves HEAD 404 status and omits the replacement body', async () => {
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(
      new Response(null, {
        status: HTTP_NOT_FOUND,
        headers: { 'content-type': 'text/html' }
      })
    )
    const response = await markdownContent(
      pageRequest({ path: '/pt/guides/html-only', method: 'HEAD' }),
      next
    )
    expect(response.status).toBe(HTTP_NOT_FOUND)
    expect(response.body).toBeNull()
    expect(response.headers.get('content-type')).toContain('text/markdown')
    expect(readParentContent).not.toHaveBeenCalled()
  })

  it.each([HTTP_OK, HTTP_FAILURE])(
    'preserves custom route responses with status %s',
    async status => {
      const cancel = vi.fn<() => void>()
      const original = new Response(new ReadableStream({ cancel }), {
        status,
        headers: { 'content-type': 'text/html', vary: 'Cookie' }
      })
      const next = vi.fn<() => Promise<Response>>().mockResolvedValue(original)
      const response = await markdownContent(
        pageRequest({ path: '/pt/guides/html-only' }),
        next
      )
      expect(response).toBe(original)
      expect(response.bodyUsed).toBe(false)
      expect(cancel).not.toHaveBeenCalled()
      expect(response.headers.get('vary')).toBe('Cookie, Accept')
      expect(readParentContent).not.toHaveBeenCalled()
    }
  )

  it('preserves the original HTML stream for HTML clients', async () => {
    const cancel = vi.fn<() => void>()
    const original = new Response(new ReadableStream({ cancel }), {
      headers: { 'content-type': 'text/html', vary: 'Accept-Language, Accept' }
    })
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(original)
    const response = await markdownContent(
      pageRequest({ accept: 'text/html' }),
      next
    )
    expect(response).toBe(original)
    expect(response.bodyUsed).toBe(false)
    expect(response.headers.get('vary')).toBe('Accept-Language, Accept')
    expect([
      cancel.mock.calls,
      readPageContent.mock.calls,
      readParentContent.mock.calls,
      readNewPageContent.mock.calls
    ]).toStrictEqual([[], [], [], []])
  })

  it.each([
    { path: '/pt', method: 'POST' },
    { path: '/_server/example' },
    { path: '/images/og.png' },
    { path: '/assets/site.js' },
    { path: '/favicon/favicon.ico' }
  ])('leaves non-page requests unchanged: %o', async options => {
    const original = new Response('untouched', { status: HTTP_NOT_FOUND })
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(original)
    const response = await markdownContent(pageRequest(options), next)
    expect(response).toBe(original)
    expect(response.headers.has('vary')).toBe(false)
    await expect(response.text()).resolves.toBe('untouched')
  })

  it('preserves non-HTML 404 responses for custom handlers', async () => {
    const original = Response.json(
      { message: 'Unknown resource' },
      { status: HTTP_NOT_FOUND }
    )
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(original)
    await expect(
      markdownContent(pageRequest({ path: '/pt/custom' }), next)
    ).resolves.toBe(original)
    expect(original.headers.get('content-type')).toContain('application/json')
    expect(original.bodyUsed).toBe(false)
  })
})

describe('route content metadata', () => {
  beforeEach(mockPageContent)

  it.each([
    '/pt/guides/new-page',
    '/en/guides/new-page/',
    '/es/guides/new-page'
  ])('serves an opted-in leaf from the route manifest at %s', async path => {
    const next = vi.fn<() => Promise<Response>>()
    const response = await markdownContent(pageRequest({ path }), next)
    expect(response.status).toBe(HTTP_OK)
    await expect(response.text()).resolves.toContain('# New route guide\n')
    expect(readNewPageContent).toHaveBeenCalledExactlyOnceWith()
    expect([
      readParentContent.mock.calls,
      readPageContent.mock.calls
    ]).toStrictEqual([[], []])
    expect(next).not.toHaveBeenCalled()
  })
})
