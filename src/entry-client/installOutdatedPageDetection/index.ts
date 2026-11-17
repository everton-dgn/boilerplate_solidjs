import {
  configureServerFunctionsClient,
  UNKNOWN_HEADER
} from '@solidjs/web/server-functions/client'
import { configureClientErrors, getObserver } from 'solid-js'

import { HTTP_CONFLICT, HTTP_NOT_FOUND } from '@/constants/http.ts'
import {
  OUTDATED_FALLBACK_EVENT,
  REFUSED_SUBMIT_EVENT
} from '@/constants/outdated-page.ts'
import {
  isVersionError,
  markPageOutdated,
  recordChunkFailure
} from '@/primitives/createOutdatedPageGuard/index.ts'

function isDeclaredRead(meta: unknown): boolean {
  return (
    typeof meta === 'object' &&
    meta !== null &&
    'method' in meta &&
    meta.method === 'GET'
  )
}

function isVersionRefusal(response: Response): boolean {
  return (
    (response.status === HTTP_NOT_FOUND || response.status === HTTP_CONFLICT) &&
    response.headers.has(UNKNOWN_HEADER)
  )
}

// No preventDefault: cancelling the event would make the import resolve undefined,
// and the lazy route would keep that empty module until the reload.
function handlePreloadError(event: Event): void {
  recordChunkFailure('payload' in event ? event.payload : undefined)
}

// The event fires after the boundary pass, outside the write that showed the
// fallback.
function announceOutdatedFallback(error: unknown): void {
  if (!isVersionError(error)) return
  queueMicrotask(() => {
    globalThis.dispatchEvent(new Event(OUTDATED_FALLBACK_EVENT))
  })
}

export function installOutdatedPageDetection(): () => void {
  globalThis.addEventListener('vite:preloadError', handlePreloadError)
  // The runtime calls the hook once per error, for every boundary that shows a
  // fallback. The slot is single, and an onError passed to render or hydrate takes
  // precedence: an error monitor must be composed here.
  configureClientErrors({ onError: announceOutdatedFallback })
  // The runtime keeps a single responseHandler; server components would take the
  // same slot (docs/server-errors.md#outdated-page-after-a-deploy).
  configureServerFunctionsClient({
    responseHandler: {
      // Render reads (tracked computation) and the ones declared with GET, such
      // as query(), GET() and live(), preloads included, reject up to an Errored,
      // which reloads at the root and warns at a local boundary.
      capture: ({ meta }) => getObserver() === null && !isDeclaredRead(meta),
      // Any returned value would resolve the call; without it the runtime rejects
      // with unknownFunction and the caller keeps its own handling.
      handle(response, { context }): void {
        if (!isVersionRefusal(response)) return
        markPageOutdated()
        if (context === true) {
          globalThis.dispatchEvent(new Event(REFUSED_SUBMIT_EVENT))
        }
      }
    }
  })
  return () => {
    globalThis.removeEventListener('vite:preloadError', handlePreloadError)
    configureClientErrors({})
    configureServerFunctionsClient({
      responseHandler: {
        handle(): void {
          // The runtime does not accept null here; without a return, the
          // transport goes back to the default behavior.
        }
      }
    })
  }
}
