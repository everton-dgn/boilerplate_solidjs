import { shouldRedirect } from '@paraglide/runtime.js'
import { createRequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'
import { endpoint } from 'virtual:solid-server-function-handler'

import { localizeRequest } from '../index.ts'

const ORIGIN = 'https://example.com'

vi.mock(import('@paraglide/runtime.js'), { spy: true })

function run(request: Request): Promise<Response> {
  return provideRequestEvent(createRequestEvent(request), () =>
    localizeRequest({
      request,
      next: () => Promise.resolve(new Response(null))
    })
  )
}

// paraglideMiddleware also reads shouldRedirect, always with effectiveRequestUrl;
// the call with the request only is the one of the middleware.
const OWN_DECISION = { request: expect.any(Request) as unknown }
const MIDDLEWARE_DECISION = {
  request: expect.any(Request) as unknown,
  effectiveRequestUrl: expect.any(URL) as unknown
}

describe('locale redirect decision', () => {
  it('does not compute the redirect for server functions', async () => {
    await run(
      new Request(`${ORIGIN}${endpoint}/save`, {
        method: 'POST',
        headers: { referer: `${ORIGIN}/pt/docs` }
      })
    )

    // Positive control: the spy watches the paraglideMiddleware calls.
    expect(shouldRedirect).toHaveBeenCalledWith(MIDDLEWARE_DECISION)
    expect(shouldRedirect).not.toHaveBeenCalledWith(OWN_DECISION)
  })

  it('computes the redirect for pages', async () => {
    await run(new Request(`${ORIGIN}/pt/docs`))

    expect(shouldRedirect).toHaveBeenCalledWith(OWN_DECISION)
  })
})
