import { getRequestEvent, isServer } from '@solidjs/web'

// Sentinel distinct from the marker. On the client the marker never exists, so a
// re-render throws with the sentinel instead of private data.
const MISSING = 'FIXTURE_MARKER_MISSING'

export function readFixtureMarker(): string {
  if (!isServer) return MISSING
  const marker: unknown = getRequestEvent()?.locals.fixtureMarker
  return typeof marker === 'string' ? marker : MISSING
}
