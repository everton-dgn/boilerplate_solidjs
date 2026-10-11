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
