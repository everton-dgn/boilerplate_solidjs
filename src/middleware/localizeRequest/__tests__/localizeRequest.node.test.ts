import { getLocale } from '@paraglide/runtime.js'
import { createRequestEvent, getRequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'
import { endpoint } from 'virtual:solid-server-function-handler'

import { localizeRequest } from '../index.ts'

const ORIGIN = 'https://example.com'

function runRequest(locale: string) {
  const request = new Request(`${ORIGIN}${endpoint}/save`, {
    method: 'POST',
    headers: {
      referer: `${ORIGIN}/${locale}/docs?filter=active`,
      'content-type': 'text/plain'
    },
    body: `body-${locale}`
  })
  const event = createRequestEvent(request)
  return provideRequestEvent(event, () =>
    localizeRequest({
      request,
      next: async () => {
        await Promise.resolve()
        const current = getRequestEvent()
        assert(current)
        return Response.json({
          sameRequest: current.request === request,
          alreadyRead: request.bodyUsed,
          body: await request.text(),
          base: current.locals.localizedPageBase,
          localsKeys: Object.keys(current.locals)
        })
      }
    })
  )
}

describe('localized request page bases', () => {
  it.each(['GET', 'HEAD'])(
    'localizes a %s page independently of Accept',
    async method => {
      const request = new Request(`${ORIGIN}/pt/missing`, {
        method,
        headers: { accept: 'application/json' }
      })
      const event = createRequestEvent(request)
      const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
        expect(getLocale()).toBe('pt')
        expect(event.locals.localizedPageBase).toBe(request.url)
        return Promise.resolve(new Response(null))
      })
      const response = await provideRequestEvent(event, () =>
        localizeRequest({ request, next })
      )
      expect(next).toHaveBeenCalledExactlyOnceWith()
      expect(response.headers.get('content-language')).toBe('pt')
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    }
  )

  it.each([
    { path: '/images/og.png', method: 'GET' },
    { path: '/pt/missing', method: 'POST' }
  ])('keeps non-page JSON requests unchanged: %o', async ({ path, method }) => {
    const request = new Request(new URL(path, ORIGIN), {
      method,
      headers: { accept: 'application/json' }
    })
    const original = new Response('unchanged')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(original)
    const event = createRequestEvent(request)
    const response = await provideRequestEvent(event, () =>
      localizeRequest({ request, next })
    )
    expect(response).toBe(original)
    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(response.headers.has('content-language')).toBe(false)
    expect(response.headers.has('set-cookie')).toBe(false)
    expect(event.locals.localizedPageBase).toBeUndefined()
  })

  it('isolates concurrent page bases while retaining each original POST and unread body', async () => {
    const responses = await Promise.all(
      ['pt', 'es'].map(locale => runRequest(locale))
    )
    const bodies: unknown[] = await Promise.all(
      responses.map(response => response.json())
    )
    expect(bodies).toStrictEqual(
      ['pt', 'es'].map(locale => ({
        sameRequest: true,
        alreadyRead: false,
        body: `body-${locale}`,
        base: `${ORIGIN}/${locale}/docs?filter=active`,
        localsKeys: ['localizedPageBase']
      }))
    )
  })
})
