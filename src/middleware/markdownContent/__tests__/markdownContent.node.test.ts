import type { Next } from '../../types.ts'
import { markdownContent } from '../index.ts'

vi.mock(import('virtual:markdown-manifest'), () => ({
  markdownPaths: { '/en': '/en/index.md', '/pt/about': '/pt/about.md' },
  markdownIndex: []
}))

const ORIGIN = 'https://example.com'
const HTTP_OK = 200
const HTTP_REDIRECT = 307
const HTTP_NOT_ACCEPTABLE = 406
const HTTP_UNAUTHORIZED = 401
const HTTP_NOT_FOUND = 404

type RequestOptions = { path?: string; accept?: string; method?: string }

function request({
  path = '/en',
  accept = 'text/markdown',
  method = 'GET'
}: RequestOptions = {}): Request {
  return new Request(`${ORIGIN}${path}`, { method, headers: { accept } })
}

function renderHtml(): Promise<Response> {
  return Promise.resolve(
    new Response('<main>HTML</main>', {
      headers: { 'content-type': 'text/html', vary: 'Cookie' }
    })
  )
}

describe('negociação de artefatos Markdown', () => {
  it('redireciona somente para um arquivo existente, sem renderizar a página', async () => {
    const render = vi.fn<Next>(renderHtml)
    const response = await markdownContent(request(), render)
    expect(response.status).toBe(HTTP_REDIRECT)
    expect(response.headers.get('location')).toBe('/en/index.md')
    expect(response.headers.get('vary')).toBe('Accept')
    await expect(response.text()).resolves.toBe('')
    expect(render).not.toHaveBeenCalled()
  })

  it.each(['/pt/about', '/pt/about/', '/pt/about?filter=private'])(
    'redireciona %s para o snapshot público canônico',
    async path => {
      const render = vi.fn<Next>(renderHtml)
      const response = await markdownContent(request({ path }), render)
      expect(response.headers.get('location')).toBe('/pt/about.md')
      expect(render).not.toHaveBeenCalled()
    }
  )

  it('mantém o HTML e acrescenta Accept sem duplicar Vary', async () => {
    const response = await markdownContent(
      request({ accept: 'text/html' }),
      renderHtml
    )
    expect(response.status).toBe(HTTP_OK)
    expect(response.headers.get('vary')).toBe('Cookie, Accept')
    await expect(response.text()).resolves.toBe('<main>HTML</main>')
  })

  it.each(['/login', '/account', '/unknown', '/api/private'])(
    'preserva a resposta de %s, sem artefato no manifesto',
    async path => {
      const original = new Response('Login required', {
        status: HTTP_UNAUTHORIZED
      })
      const render = vi.fn<Next>(() => Promise.resolve(original))
      const response = await markdownContent(request({ path }), render)
      expect(response).toBe(original)
      expect(response.status).toBe(HTTP_UNAUTHORIZED)
      expect(response.headers.get('vary')).toBeNull()
      expect(render).toHaveBeenCalledOnce()
    }
  )

  it.each(['GET', 'HEAD'])(
    'responde 404 para arquivo ausente usando %s sem renderizar HTML',
    async method => {
      const render = vi.fn<Next>(renderHtml)
      const response = await markdownContent(
        request({ path: '/pt/login.md', method }),
        render
      )
      expect(response.status).toBe(HTTP_NOT_FOUND)
      expect(response.headers.get('content-type')).toBe(
        'text/plain; charset=utf-8'
      )
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      await expect(response.text()).resolves.toBe(
        method === 'HEAD' ? '' : 'Not found\n'
      )
      expect(render).not.toHaveBeenCalled()
    }
  )

  it.each(['GET', 'HEAD'])(
    'responde 406 apenas para a página publicada usando %s',
    async method => {
      const render = vi.fn<Next>(renderHtml)
      const response = await markdownContent(
        request({ method, accept: 'application/json' }),
        render
      )
      expect(response.status).toBe(HTTP_NOT_ACCEPTABLE)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      await expect(response.text()).resolves.toBe(
        method === 'HEAD' ? '' : 'text/html\ntext/markdown\n'
      )
      expect(render).not.toHaveBeenCalled()
    }
  )

  it('preserva métodos de mutação mesmo em página com artefato', async () => {
    const render = vi.fn<Next>(renderHtml)
    const response = await markdownContent(request({ method: 'POST' }), render)
    expect(response.status).toBe(HTTP_OK)
    expect(response.headers.get('location')).toBeNull()
    expect(render).toHaveBeenCalledOnce()
  })

  it('redireciona HEAD sem gerar um corpo', async () => {
    const response = await markdownContent(
      request({ method: 'HEAD' }),
      renderHtml
    )
    expect(response.status).toBe(HTTP_REDIRECT)
    expect(response.headers.get('location')).toBe('/en/index.md')
    await expect(response.text()).resolves.toBe('')
  })
})
