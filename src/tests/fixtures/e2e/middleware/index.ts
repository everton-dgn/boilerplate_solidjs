import { getRequestEvent } from '@solidjs/web'
import * as v from 'valibot'

import { delocalizePathname } from '@/i18n/urls/index.ts'
import { requestJson } from '@/infra/server/requestJson/index.ts'
import { createMiddleware } from '@/middleware/index.ts'

import { fixtureError } from '../backend/fixtureError/index.ts'
import { readFixtureMarker } from '../outside-error/readFixtureMarker/index.ts'
import { recordFixtureThrow } from '../outside-error/recordFixtureThrow/index.ts'

type Next = () => Promise<Response>
type FailureRequest = { request: Request; phase: 'before' | 'after' }

const PREFIX = '/outside-error'

// Loads the marker of the synthetic backend for the error fixtures outside server
// functions. The value stays only in locals, which the runtime does not
// serialize. The header tells the test, without the marker, whether the fixture
// received the data.
async function fixtureMarker(request: Request, next: Next) {
  const url = new URL(request.url)
  const pathname = delocalizePathname(url.pathname)
  const id = url.searchParams.get('id')
  const event = getRequestEvent()
  // Middleware failures can be requested on any path, API routes and the server
  // function endpoint included.
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

// The response of this failure is the one of the containment, without the
// fixture headers; the positive control goes to the synthetic backend before the throw.
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

// Middleware exception before next(): no response was produced.
async function fixtureFailureBefore(request: Request, next: Next) {
  if (failureRequested({ request, phase: 'before' })) {
    await throwFixtureFailure(request)
  }
  return next()
}

// Middleware exception after next(): the response was already produced.
async function fixtureFailureAfter(request: Request, next: Next) {
  const response = await next()
  if (failureRequested({ request, phase: 'after' })) {
    await throwFixtureFailure(request)
  }
  return response
}

// The production factory puts the injected failures in front of the real chain,
// inside the same containment.
export default createMiddleware([
  fixtureMarker,
  fixtureFailureBefore,
  fixtureFailureAfter
])
