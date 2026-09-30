import { getRequestEvent, isServer } from '@solidjs/web'

// Controle positivo da fixture: registra, sem o valor, se o erro que será
// lançado carrega o marcador que o middleware carregou nesta requisição.
export function recordFixtureThrow(marker: string): boolean {
  if (!isServer) return false
  const event = getRequestEvent()
  const real = marker === event?.locals.fixtureMarker
  if (event) event.locals.fixtureThrown = real ? 'real' : 'missing'
  return real
}
