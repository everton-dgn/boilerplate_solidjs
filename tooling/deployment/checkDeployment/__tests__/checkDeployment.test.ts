/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { checkDeployment } from '../index.ts'

const DEPLOYMENT_URL = 'https://test-deployment.vercel.app'
const SECRET = 'test-bypass-token'
const EXPECTED_CHECKS = 20
const MANIFEST = [
  { path: '/pt', href: '/pt/index.md', locale: 'pt' },
  { path: '/en/about', href: '/en/about.md', locale: 'en' }
]

function respond(request: Request): Response {
  const { pathname } = new URL(request.url)
  const entry = MANIFEST.find(
    page => page.path === pathname.replace(/\/$/u, '') || page.href === pathname
  )
  assert.ok(entry)
  if (pathname.endsWith('.md')) {
    return new Response(request.method === 'HEAD' ? null : '# Public page\n', {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-language': entry.locale
      }
    })
  }
  if (request.headers.get('accept') === 'text/markdown') {
    return new Response(null, {
      status: 307,
      headers: {
        location: entry.href,
        vary: 'Accept',
        'cache-control': 'private, no-store'
      }
    })
  }
  return new Response(
    request.method === 'HEAD' ? null : '<!DOCTYPE html><html></html>',
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        vary: 'Accept-Encoding, Accept'
      }
    }
  )
}

describe('deployed routing checks', () => {
  it('checks GET and HEAD on HTML, negotiated and direct Markdown URLs without following redirects', async () => {
    const requests: Request[] = []
    const checks = await checkDeployment({
      url: DEPLOYMENT_URL,
      manifest: MANIFEST,
      bypassSecret: SECRET,
      request: request => {
        requests.push(request)
        assert.equal(new URL(request.url).origin, DEPLOYMENT_URL)
        assert.equal(request.headers.get('x-vercel-protection-bypass'), SECRET)
        assert.equal(request.redirect, 'manual')
        assert.equal(request.signal.aborted, false)
        return Promise.resolve(respond(request))
      }
    })
    assert.equal(checks, EXPECTED_CHECKS)
    assert.equal(requests.length, checks)
    for (const entry of MANIFEST) {
      for (const pathname of [entry.path, `${entry.path}/`, entry.href]) {
        assert.deepEqual(
          requests
            .filter(request => new URL(request.url).pathname === pathname)
            .map(request => request.method),
          pathname.endsWith('.md')
            ? ['GET', 'HEAD']
            : ['GET', 'GET', 'HEAD', 'HEAD']
        )
      }
    }
  })

  it('rejects the production regression: a directory returns its Markdown index to a browser', async () => {
    await assert.rejects(
      checkDeployment({
        url: DEPLOYMENT_URL,
        manifest: MANIFEST,
        bypassSecret: SECRET,
        request: () =>
          Promise.resolve(
            new Response('# Home', {
              headers: { 'content-type': 'text/markdown; charset=utf-8' }
            })
          )
      }),
      /GET \/pt .*expected Content-Type text\/html/u
    )
  })

  it('allows a build with Markdown publication disabled', async () => {
    const checks = await checkDeployment({
      url: DEPLOYMENT_URL,
      manifest: [],
      bypassSecret: '',
      request: () => {
        throw new Error('No Markdown routes should be requested')
      }
    })
    assert.equal(checks, 0)
  })

  it('rejects protection responses, wrong content, headers and redirect destinations', async () => {
    const mutations = [
      () => new Response(null, { status: 429 }),
      () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://vercel.com/login' }
        }),
      (response: Response) => {
        response.headers.delete('vary')
        return response
      },
      (response: Response) => {
        response.headers.set('content-type', 'text/plain')
        return response
      },
      (response: Response) => {
        response.headers.set('location', 'https://example.com/pt/index.md')
        return response
      },
      (response: Response) => {
        response.headers.set('cache-control', 'public')
        return response
      },
      (response: Response) => {
        response.headers.set('content-language', 'es')
        return response
      },
      (response: Response) =>
        new Response('Unexpected body', {
          status: response.status,
          headers: response.headers
        })
    ]
    for (const mutate of mutations) {
      await assert.rejects(
        checkDeployment({
          url: DEPLOYMENT_URL,
          manifest: MANIFEST,
          bypassSecret: SECRET,
          request: request => Promise.resolve(mutate(respond(request)))
        }),
        /expected|missing|invalid|incorrect/u
      )
    }
  })

  it('validates every destination before sending the bypass credential', async () => {
    const invalidOptions = [
      { url: 'https://example.com' },
      { url: 'https://deployment.vercel.app.example.com' },
      { url: 'http://deployment.vercel.app' },
      { url: `${DEPLOYMENT_URL}/?secret=value` },
      { bypassSecret: '' },
      { manifest: {} },
      {
        manifest: [
          ...MANIFEST,
          { path: '//example.com', href: '/index.md', locale: 'en' }
        ]
      },
      {
        manifest: [
          ...MANIFEST,
          { path: '/pt', href: '/\\example.com/index.md', locale: 'pt' }
        ]
      },
      {
        manifest: [
          ...MANIFEST,
          { path: '/pt/../en', href: '/index.md', locale: 'pt' }
        ]
      }
    ]
    for (const overrides of invalidOptions) {
      let requests = 0
      await assert.rejects(
        checkDeployment({
          url: DEPLOYMENT_URL,
          manifest: MANIFEST,
          bypassSecret: SECRET,
          ...overrides,
          request: request => {
            requests += 1
            return Promise.resolve(respond(request))
          }
        })
      )
      assert.equal(requests, 0)
    }
  })

  it('checks HEAD independently of GET', async () => {
    await assert.rejects(
      checkDeployment({
        url: DEPLOYMENT_URL,
        manifest: MANIFEST,
        bypassSecret: SECRET,
        request: request => {
          const response = respond(request)
          if (request.method === 'HEAD') {
            response.headers.set('content-type', 'text/markdown')
          }
          return Promise.resolve(response)
        }
      }),
      /HEAD \/pt .*expected Content-Type text\/html/u
    )
  })

  it('does not expose credentials included in transport errors', async () => {
    await assert.rejects(
      checkDeployment({
        url: DEPLOYMENT_URL,
        manifest: MANIFEST,
        bypassSecret: SECRET,
        request: () =>
          Promise.reject(new Error(`Transport failure with ${SECRET}`))
      }),
      error =>
        error instanceof Error &&
        error.message.startsWith('Deployment request failed:') &&
        !String(error.stack).includes(SECRET) &&
        error.cause === undefined
    )
  })
})
