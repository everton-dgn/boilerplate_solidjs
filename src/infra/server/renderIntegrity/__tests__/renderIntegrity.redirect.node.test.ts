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
// From this size on the runtime writes the shell inside the first write, and the
// redirect abandons the render before the next flush runs.
const SYNC_WRITE_CHARS = 16_384

function redirectingPage() {
  httpStatus(HTTP_TEMPORARY_REDIRECT)
  httpHeader('location', '/destination')
  return ssr(['<main>', '</main>'], 'x'.repeat(SYNC_WRITE_CHARS))
}

describe('redirect during the render', () => {
  it('abandons a large shell without an unhandled rejection', async () => {
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
      // The unhandled rejection is only emitted after the microtask queue.
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
