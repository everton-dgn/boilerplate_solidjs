import { getRequestEvent, isServer } from '@solidjs/web'

// Positive control of the fixture: records, without the value, whether the error
// about to be thrown carries the marker that the middleware loaded in this request.
export function recordFixtureThrow(marker: string): boolean {
  if (!isServer) return false
  const event = getRequestEvent()
  const real = marker === event?.locals.fixtureMarker
  if (event) event.locals.fixtureThrown = real ? 'real' : 'missing'
  return real
}
