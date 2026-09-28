import { getRequestEvent, isServer } from '@solidjs/web'

// Sentinela distinta do marcador. No cliente o marcador nunca existe, então
// uma re-renderização lança com a sentinela em vez de um dado privado.
const MISSING = 'FIXTURE_MARKER_MISSING'

export function readFixtureMarker(): string {
  if (!isServer) return MISSING
  const marker: unknown = getRequestEvent()?.locals.fixtureMarker
  return typeof marker === 'string' ? marker : MISSING
}
