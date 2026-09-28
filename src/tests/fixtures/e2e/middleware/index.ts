import { getRequestEvent } from '@solidjs/web'
import * as v from 'valibot'

import { requestJson } from '@/infra/server/requestJson/index.ts'
import productionMiddleware from '@/middleware/index.ts'

import { fixtureError } from '../outside-error/fixtureError/index.ts'

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

function readMarker(): string {
  const marker: unknown = getRequestEvent()?.locals.fixtureMarker
  return typeof marker === 'string' ? marker : 'FIXTURE_MARKER_MISSING'
}

function failureRequested(request: Request, phase: string): boolean {
  const url = new URL(request.url)
  return (
    url.pathname === PREFIX &&
    url.searchParams.get('case') === `middleware-${phase}`
  )
}

// Exceção de middleware antes de next(): nenhuma resposta foi produzida.
function fixtureFailureBefore(request: Request, next: Next) {
  if (failureRequested(request, 'before')) throw fixtureError(readMarker())
  return next()
}

// Exceção de middleware depois de next(): a resposta já foi produzida.
async function fixtureFailureAfter(request: Request, next: Next) {
  const response = await next()
  if (failureRequested(request, 'after')) throw fixtureError(readMarker())
  return response
}

// A contenção da produção fica na frente de tudo, inclusive das falhas
// injetadas; o teste Node do middleware fixa essa posição na cadeia real.
const [containFailures, ...productionChain] = productionMiddleware
if (!containFailures) throw new Error('Contain failures middleware not found')

const middleware = [
  containFailures,
  fixtureMarker,
  fixtureFailureBefore,
  fixtureFailureAfter,
  ...productionChain
]

export default middleware
