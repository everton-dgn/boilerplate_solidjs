import { getRequestEvent } from '@solidjs/web'
import * as v from 'valibot'

import { delocalizePathname } from '@/i18n/urls/index.ts'
import { requestJson } from '@/infra/server/requestJson/index.ts'
import { createMiddleware } from '@/middleware/index.ts'

import { fixtureError } from '../outside-error/fixtureError/index.ts'
import { readFixtureMarker } from '../outside-error/readFixtureMarker/index.ts'
import { recordFixtureThrow } from '../outside-error/recordFixtureThrow/index.ts'

type Next = () => Promise<Response>
type FailureRequest = { request: Request; phase: 'before' | 'after' }

const PREFIX = '/outside-error'

// Carrega o marcador do backend sintético para as fixtures de erro fora de
// server functions. O valor fica só em locals, que o runtime não serializa.
// O header informa ao teste, sem o marcador, se a fixture recebeu o dado.
async function fixtureMarker(request: Request, next: Next) {
  const url = new URL(request.url)
  const pathname = delocalizePathname(url.pathname)
  const id = url.searchParams.get('id')
  const event = getRequestEvent()
  // Falhas de middleware podem ser pedidas em qualquer caminho, inclusive
  // rotas de API e o endpoint de server functions.
  const middlewareCase =
    url.searchParams.get('case')?.startsWith('middleware-') === true
  if (event && id && (pathname === PREFIX || middlewareCase)) {
    const data = await requestJson({
      url: `http://127.0.0.1:4318/data?id=${encodeURIComponent(id)}`,
      schema: v.object({ message: v.string() })
    })
    event.locals.fixtureMarker = data.message
  }
  const response = await next()
  if (pathname === PREFIX) {
    const loaded = typeof event?.locals.fixtureMarker === 'string'
    const thrown: unknown = event?.locals.fixtureThrown
    response.headers.set('x-fixture-marker', loaded ? 'loaded' : 'missing')
    response.headers.set(
      'x-fixture-thrown',
      typeof thrown === 'string' ? thrown : 'none'
    )
  }
  return response
}

function failureRequested({ request, phase }: FailureRequest): boolean {
  const url = new URL(request.url)
  return url.searchParams.get('case') === `middleware-${phase}`
}

// A resposta desta falha é a da contenção, sem os headers da fixture; o
// controle positivo vai ao backend sintético antes do lançamento.
async function throwFixtureFailure(request: Request): Promise<never> {
  const id = new URL(request.url).searchParams.get('id') ?? ''
  const marker = readFixtureMarker()
  const real = recordFixtureThrow(marker)
  const query = new URLSearchParams({ id, real: real ? '1' : '0' })
  await requestJson({
    url: `http://127.0.0.1:4318/report?${query}`,
    schema: v.object({ ready: v.boolean() })
  })
  throw fixtureError(marker)
}

// Exceção de middleware antes de next(): nenhuma resposta foi produzida.
async function fixtureFailureBefore(request: Request, next: Next) {
  if (failureRequested({ request, phase: 'before' })) {
    await throwFixtureFailure(request)
  }
  return next()
}

// Exceção de middleware depois de next(): a resposta já foi produzida.
async function fixtureFailureAfter(request: Request, next: Next) {
  const response = await next()
  if (failureRequested({ request, phase: 'after' })) {
    await throwFixtureFailure(request)
  }
  return response
}

// A fábrica da produção põe as falhas injetadas na frente da cadeia real,
// dentro da mesma contenção.
export default createMiddleware([
  fixtureMarker,
  fixtureFailureBefore,
  fixtureFailureAfter
])
