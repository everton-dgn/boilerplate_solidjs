import { isPageRequest } from '../index.ts'

vi.mock(import('virtual:solid-server-function-handler'), () => ({
  endpoint: '/rpc/execute'
}))

vi.mock(import('filesystem-routing/api'), async importOriginal => {
  const api = await importOriginal()
  return {
    ...api,
    createAPIMatcher: () =>
      api.createAPIMatcher([
        {
          path: '/api/write',
          $POST: { require: () => ({ POST: () => new Response('written') }) }
        },
        {
          path: '/api/report',
          $GET: { require: () => ({ GET: () => new Response('report') }) }
        },
        {
          path: '/page-with-handler',
          page: true,
          $component: {},
          $GET: { require: () => ({ GET: () => new Response('page') }) }
        }
      ])
  }
})

describe('shared page request classification', () => {
  it.each([
    ['GET', '/pt/docs', 'text/html', true],
    ['GET', '/pt/docs', 'text/markdown', true],
    ['HEAD', '/pt/docs', 'text/markdown', true],
    ['GET', '/pt/docs', 'text/markdown;q=0', false],
    ['GET', '/pt/docs', 'text/html;q=0', false],
    ['HEAD', '/pt/docs', 'text/html', true],
    ['GET', '/pt/docs', '*/*', true],
    ['GET', '/pt/docs', undefined, true],
    ['GET', '/pt/docs', 'application/json', false],
    ['POST', '/pt/docs', 'text/html', false],
    ['GET', '/api/report', 'text/html', false],
    ['GET', '/api/report', 'text/markdown', false],
    ['GET', '/api/write', 'text/markdown', false],
    ['HEAD', '/api/write', 'text/markdown', false],
    ['HEAD', '/api/report', 'text/html', false],
    ['GET', '/page-with-handler', 'text/html', true],
    ['GET', '/rpc/execute', 'text/html', false],
    ['GET', '/rpc/execute', 'text/markdown', false],
    ['GET', '/rpc/execute/save', 'text/html', false],
    ['GET', '/rpc/execute-guide', 'text/html', true],
    ['GET', '/images/og.png', 'text/markdown', false],
    ['GET', '/assets/index.js', 'text/markdown', false],
    ['GET', '/favicon/favicon.ico', 'text/html', false],
    ['GET', '/favicon.ico', 'text/markdown', false]
  ])('classifies %s %s with Accept %s', (method, path, accept, isPage) => {
    const request = new Request(new URL(path, 'https://example.com'), {
      method,
      headers: accept ? { accept } : undefined
    })
    expect(isPageRequest(request)).toBe(isPage)
  })
})
