import { getRequestEvent } from '@solidjs/web'
import * as v from 'valibot'

import { requestJson } from '@/infra/server/requestJson/index.ts'
import productionMiddleware from '@/middleware/index.ts'

type Next = () => Promise<Response>

const PREFIX = '/outside-error'

// Carrega o marcador do backend sintético para as fixtures de erro fora de
// server functions. O valor fica só em locals, que o runtime não serializa.
// O header informa ao teste, sem o marcador, se a fixture recebeu o dado.
async function fixtureMarker(request: Request, next: Next) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const event = getRequestEvent()
  if (event && id && url.pathname === PREFIX) {
    const data = await requestJson({
      url: `http://127.0.0.1:4318/data?id=${encodeURIComponent(id)}`,
      schema: v.object({ message: v.string() })
    })
    event.locals.fixtureMarker = data.message
  }
  const response = await next()
  if (url.pathname === PREFIX) {
    const loaded = typeof event?.locals.fixtureMarker === 'string'
    response.headers.set('x-fixture-marker', loaded ? 'loaded' : 'missing')
  }
  return response
}

const middleware = [fixtureMarker, ...productionMiddleware]

export default middleware
