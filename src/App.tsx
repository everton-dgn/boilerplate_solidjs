import { getRequestEvent, isServer, type JSX } from '@solidjs/web'
import {
  createSignal,
  Errored,
  onSettled,
  Show,
  untrack,
  type ParentProps
} from 'solid-js'

import { OutdatedPageNotice } from '@/components/molecules/OutdatedPageNotice/index.tsx'
import { Provider } from '@/components/molecules/Provider/index.tsx'
import { ErrorFallback } from '@/components/organisms/ErrorFallback/index.tsx'
import { createSeo } from '@/primitives/createSeo/index.ts'

import { createLocaleNavigationGuard } from './primitives/createLocaleNavigationGuard/index.ts'
import {
  claimOutdatedPageReload,
  createOutdatedPageGuard,
  isVersionError
} from './primitives/createOutdatedPageGuard/index.ts'
import { Router } from './router.ts'

import './theme/globalStyles.css'

// The gate must throw before the Router to reach the root Errored.
function ServerFailureGate(props: ParentProps) {
  const failure = isServer ? getRequestEvent()?.locals.serverFailure : undefined
  if (failure) throw failure
  return <>{props.children}</>
}

// A beforeunload of the page can cancel the reload, and the first SSR after the
// deploy can hit a cold server. Once the deadline passes, the error page replaces
// the blank screen.
const RELOAD_STALL_MS = 10_000

// The router writes the target URL in an onSettled without an owner, which can be
// left for the next pass of the queue; the setTimeout reloads after it drains.
function ReloadWhenSettled() {
  const [isStalled, setIsStalled] = createSignal(false)
  onSettled(() => {
    setTimeout(() => {
      globalThis.location.reload()
    }, 0)
    const stall = setTimeout(() => {
      setIsStalled(true)
    }, RELOAD_STALL_MS)
    return () => {
      clearTimeout(stall)
    }
  })
  return (
    <Show when={isStalled()}>
      <ErrorFallback kind="runtime" />
    </Show>
  )
}

// A chunk or a server function that the new deploy does not have is not a
// failure of the page: the new document solves it, so the error page is left for
// the reload that did not solve it.
function renderRootFallback(error: unknown): JSX.Element {
  if (!isServer && isVersionError(error) && claimOutdatedPageReload()) {
    return <ReloadWhenSettled />
  }
  return <ErrorFallback kind="runtime" />
}

export default function App() {
  // The rest parameters keep fallback.length at zero, the condition for Solid's
  // Errored to report the error in the console in development. The error is read
  // without tracking: a later error would rebuild the fallback, and the lock
  // already written would replace the pending reload with the error page.
  return (
    <Errored fallback={(...args) => renderRootFallback(untrack(args[0]))}>
      <ServerFailureGate>
        <Provider>
          {/* Inside the root Errored: the global fallback unmounts the notice. */}
          <OutdatedPageNotice />
          <Router>
            {props => {
              createLocaleNavigationGuard()
              createOutdatedPageGuard()
              createSeo({ route: true })
              return props.children
            }}
          </Router>
        </Provider>
      </ServerFailureGate>
    </Errored>
  )
}
