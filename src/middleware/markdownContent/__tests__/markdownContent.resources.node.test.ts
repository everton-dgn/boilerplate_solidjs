import { SITE } from '@/constants/site/index.ts'

import {
  MARKDOWN_TIMEOUT_MS,
  MAX_HTML_BYTES,
  MAX_MARKDOWN_BYTES
} from '../constants.ts'
import {
  markdownContent,
  event,
  html,
  mockPublishedRoute,
  resetPublicationController,
  cancelOpenResponses,
  getPublicationMetrics
} from './fixtures.ts'

const EXPANDING_LINK = '<a href="/">x</a> '
const HTTP_SERVER_ERROR = 500
const HTTP_UNAVAILABLE = 503

async function expectUnavailableHead(response: Response): Promise<void> {
  expect(response.status).toBe(HTTP_UNAVAILABLE)
  await expect(response.text()).resolves.toBe('')
}

describe('markdown resource bounds', () => {
  beforeEach(() => {
    resetPublicationController()
    mockPublishedRoute()
  })
  afterEach(async () => {
    await cancelOpenResponses()
    vi.useRealTimers()
  })

  it('refuses excess Markdown with private no-store and Retry-After', async () => {
    const controllers = [new AbortController(), new AbortController()]
    const render = vi.fn<() => Promise<Response>>(
      () => Promise.withResolvers<Response>().promise
    )
    const pending = controllers.map(controller =>
      markdownContent(event({ signal: controller.signal }), render)
    )
    const get = await markdownContent(event(), render)
    const head = await markdownContent(event({ method: 'HEAD' }), render)
    expect(get.status).toBe(HTTP_UNAVAILABLE)
    await expectUnavailableHead(head)
    expect(get.headers.get('cache-control')).toBe('private, no-store')
    expect(get.headers.get('retry-after')).toBe('1')
    controllers.forEach(controller => controller.abort())
    await Promise.all(pending)
    expect(render).toHaveBeenCalledTimes(controllers.length)
  })

  it('keeps HEAD body empty after client cancellation', async () => {
    const controller = new AbortController()
    const pending = markdownContent(
      event({ method: 'HEAD', signal: controller.signal }),
      () => Promise.withResolvers<Response>().promise
    )
    controller.abort()
    const response = await pending
    expect(response.status).toBe(HTTP_SERVER_ERROR)
    expect(response.body).toBeNull()
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it.each([
    undefined,
    { hasErrors: true, hasCompleted: true },
    { hasErrors: false, hasCompleted: false },
    { hasErrors: undefined, hasCompleted: true }
  ])(
    'refuses publication without completed error-free SSR: %j',
    async state => {
      const request = event()
      Object.assign(request.locals, { ssrRenderState: state })
      const response = await markdownContent(request, () => html())
      expect(response.status).toBe(HTTP_SERVER_ERROR)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      await expect(response.text()).resolves.not.toContain('Public content')
    }
  )

  it('normalizes an HTML 500 with render errors', async () => {
    const request = event()
    request.locals.ssrRenderState = { hasErrors: true, hasCompleted: true }
    const response = await markdownContent(request, () =>
      html('Partial fallback', HTTP_SERVER_ERROR)
    )
    expect(response.status).toBe(HTTP_SERVER_ERROR)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    await expect(response.text()).resolves.not.toContain('Partial fallback')
  })

  // O adaptador roda fora do contexto de idioma; o idioma vem da requisição.
  it.each([
    ['/pt/about.md', 'Não foi possível concluir a solicitação.'],
    ['/en/about.md', 'The request could not be completed.'],
    ['/es/about.md', 'No se pudo completar la solicitud.']
  ])(
    'answers the public 500 of %s in the request locale',
    async (path, message) => {
      const request = event({ path })
      Object.assign(request.locals, { ssrRenderState: undefined })
      const response = await markdownContent(request, () => html())
      expect(response.status).toBe(HTTP_SERVER_ERROR)
      await expect(response.text()).resolves.toBe(message)
    }
  )

  // A contenção do middleware registra o log e responde 500 público.
  it('bounds conversion input', async () => {
    await expect(
      markdownContent(event(), () => html('x'.repeat(MAX_HTML_BYTES + 1)))
    ).rejects.toThrow('Markdown document limit exceeded')
  })

  it('rejects Markdown that grows beyond the output budget from valid HTML', async () => {
    const expectedLink = `[x](${new URL('/', SITE.url).href}) `
    const count = Math.floor(MAX_MARKDOWN_BYTES / expectedLink.length) + 1
    const htmlBody = `<main>${EXPANDING_LINK.repeat(count)}</main>`
    expect(new TextEncoder().encode(htmlBody).byteLength).toBeLessThan(
      MAX_HTML_BYTES
    )
    await expect(
      markdownContent(event(), () => html(htmlBody))
    ).rejects.toThrow('Markdown output limit exceeded')
    expect(getPublicationMetrics().reservedBytes).toBe(0)
  })

  it('propagates client cancellation to the render request', async () => {
    const controller = new AbortController()
    const request = event({ signal: controller.signal })
    const next = vi.fn<() => Promise<Response>>(
      () => Promise.withResolvers<Response>().promise
    )
    const pending = markdownContent(request, next)
    controller.abort()
    const response = await pending
    expect(response.status).toBe(HTTP_SERVER_ERROR)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(request.request.signal.aborted).toBe(true)
  })

  it('bounds SSR waiting and aborts its signal on timeout', async () => {
    vi.useFakeTimers()
    const request = event()
    const pending = markdownContent(
      request,
      () => Promise.withResolvers<Response>().promise
    )
    await vi.advanceTimersByTimeAsync(MARKDOWN_TIMEOUT_MS)
    const response = await pending
    expect(response.status).toBe(HTTP_SERVER_ERROR)
    expect(request.request.signal.aborted).toBe(true)
  })
})
