import { setImmediate as nextTurn } from 'node:timers/promises'

import {
  createRequestEvent,
  createSSRResponse,
  httpHeader,
  httpStatus,
  renderToStream,
  ssr
} from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'

const HTTP_TEMPORARY_REDIRECT = 307
// A partir deste tamanho o runtime grava o shell dentro do primeiro write, e
// o redirect abandona o render antes de o flush seguinte rodar.
const SYNC_WRITE_CHARS = 16_384

function redirectingPage() {
  httpStatus(HTTP_TEMPORARY_REDIRECT)
  httpHeader('location', '/destination')
  return ssr(['<main>', '</main>'], 'x'.repeat(SYNC_WRITE_CHARS))
}

describe('redirect durante o render', () => {
  it('abandona um shell grande sem rejeição não tratada', async () => {
    const failures: unknown[] = []
    const capture = (failure: unknown) => {
      failures.push(failure)
    }
    process.on('unhandledRejection', capture)
    process.on('uncaughtException', capture)
    const event = createRequestEvent(new Request('http://localhost/'))

    try {
      const response = await provideRequestEvent(event, () =>
        createSSRResponse(renderToStream(redirectingPage), event)
      )
      // A rejeição sem tratamento só é emitida depois da fila de microtasks.
      await nextTurn()
      await nextTurn()

      expect({
        status: response.status,
        location: response.headers.get('location'),
        failures
      }).toStrictEqual({
        status: HTTP_TEMPORARY_REDIRECT,
        location: '/destination',
        failures: []
      })
    } finally {
      process.off('unhandledRejection', capture)
      process.off('uncaughtException', capture)
    }
  })
})
