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

// O paraglideMiddleware também consulta shouldRedirect, sempre com
// effectiveRequestUrl; a chamada só com a requisição é a do middleware.
const OWN_DECISION = { request: expect.any(Request) as unknown }
const MIDDLEWARE_DECISION = {
  request: expect.any(Request) as unknown,
  effectiveRequestUrl: expect.any(URL) as unknown
}

describe('decisão de redirect do idioma', () => {
  it('não calcula o redirect para server functions', async () => {
    await run(
      new Request(`${ORIGIN}${endpoint}/save`, {
        method: 'POST',
        headers: { referer: `${ORIGIN}/pt/docs` }
      })
    )

    // Controle positivo: o spy observa as chamadas do paraglideMiddleware.
    expect(shouldRedirect).toHaveBeenCalledWith(MIDDLEWARE_DECISION)
    expect(shouldRedirect).not.toHaveBeenCalledWith(OWN_DECISION)
  })

  it('calcula o redirect para páginas', async () => {
    await run(new Request(`${ORIGIN}/pt/docs`))

    expect(shouldRedirect).toHaveBeenCalledWith(OWN_DECISION)
  })
})
