import {
  createRouter,
  memoryHistory,
  useBeforeLeave,
  useLocation,
  useNavigate,
  type BeforeLeaveEventArgs,
  type MemoryHistoryAdapter
} from '@solidjs/router'
import { flush } from 'solid-js'
import type { MockInstance } from 'vite-plus/test'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import {
  claimOutdatedPageReload,
  createOutdatedPageGuard,
  isVersionError,
  markPageOutdated,
  recordChunkFailure,
  registerUnsavedChanges
} from '../index.ts'

type Navigate = ReturnType<typeof useNavigate>
type GuardedRouter = { host: HTMLDivElement; navigate: () => Navigate }
type GuardedRouterOptions = {
  history?: MemoryHistoryAdapter
  shouldCancelFirst?: boolean
  onPageLeave?: (event: BeforeLeaveEventArgs) => void
}
type LocationWrite = MockInstance<(url: string | URL) => void>
type DocumentNavigation = { assign: LocationWrite; replace: LocationWrite }

const RELOAD_WINDOW_MS = 30_000
const START_MS = 1_000_000

type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>

function throwBlocked(): never {
  throw new DOMException('Blocked', 'SecurityError')
}

function readNothing(): null {
  return null
}

function writeNothing(): void {
  /* The write does not matter when the read was already refused. */
}

function hasDraft(): boolean {
  return true
}

function spyDocumentNavigation(): DocumentNavigation {
  return {
    assign: vi.spyOn(globalThis.location, 'assign').mockImplementation(() => {
      /* Stays in the test document. */
    }),
    replace: vi.spyOn(globalThis.location, 'replace').mockImplementation(() => {
      /* Stays in the test document. */
    })
  }
}

async function renderGuardedRouter({
  history = memoryHistory('/en/start'),
  shouldCancelFirst = false,
  onPageLeave
}: GuardedRouterOptions = {}): Promise<GuardedRouter> {
  let navigate: Navigate | undefined
  function Page() {
    navigate = useNavigate()
    if (onPageLeave) useBeforeLeave(onPageLeave)
    const location = useLocation()
    return (
      <output>
        {location.pathname}
        {location.search}
      </output>
    )
  }
  const Router = createRouter({
    history,
    routes: [{ path: '*all', component: Page }]
  })
  const host = renderComponent(
    () => (
      <Router>
        {props => {
          if (shouldCancelFirst) useBeforeLeave(event => event.preventDefault())
          createOutdatedPageGuard()
          return props.children
        }}
      </Router>
    ),
    { hasProviders: false }
  )
  await expect.poll(() => host.textContent).toBe('/en/start')
  return {
    host,
    navigate: () => {
      assert(navigate)
      return navigate
    }
  }
}

// The mark lasts until the next document load and does not go back in the
// module. The case of the tab that is still current is in
// createOutdatedPageGuard.initial.dom.test.tsx, which loads the module isolated.
describe('outdated page guard', () => {
  beforeEach(markPageOutdated)

  it('turns into a document navigation the navigation that changes the path', async () => {
    const { assign } = spyDocumentNavigation()
    const { host, navigate } = await renderGuardedRouter()
    navigate()('/en/other?q=1#part')
    flush()
    expect(assign).toHaveBeenCalledWith(
      `${globalThis.location.origin}/en/other?q=1#part`
    )
    expect(host.textContent).toBe('/en/start')
  })

  it('respects the cancellation of an earlier guard', async () => {
    const { assign, replace } = spyDocumentNavigation()
    const { host, navigate } = await renderGuardedRouter({
      shouldCancelFirst: true
    })
    navigate()('/en/other')
    flush()
    expect(host.textContent).toBe('/en/start')
    expect(assign).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  // The version guard is subscribed before the routes: without the registration,
  // the draft guard of the page would see defaultPrevented and not ask.
  it('leaves the navigation on the client for the page with unsaved changes', async () => {
    const { assign } = spyDocumentNavigation()
    onTestFinished(registerUnsavedChanges(() => true))
    let wasPrevented: boolean | undefined
    const { host, navigate } = await renderGuardedRouter({
      onPageLeave: event => {
        wasPrevented = event.defaultPrevented
      }
    })
    navigate()('/en/other')
    await expect.poll(() => host.textContent).toBe('/en/other')
    expect(wasPrevented).toBe(false)
    expect(assign).not.toHaveBeenCalled()
  })

  it('one check with changes is enough to keep the navigation on the client', async () => {
    const { assign } = spyDocumentNavigation()
    onTestFinished(registerUnsavedChanges(() => false))
    onTestFinished(registerUnsavedChanges(() => true))
    const { host, navigate } = await renderGuardedRouter()
    navigate()('/en/other')
    await expect.poll(() => host.textContent).toBe('/en/other')
    expect(assign).not.toHaveBeenCalled()
  })

  it('keeps the protection when only one of two registrations of the same check leaves', async () => {
    const { assign } = spyDocumentNavigation()
    const removeFirst = registerUnsavedChanges(hasDraft)
    onTestFinished(registerUnsavedChanges(hasDraft))
    removeFirst()
    const { host, navigate } = await renderGuardedRouter()
    navigate()('/en/other')
    await expect.poll(() => host.textContent).toBe('/en/other')
    expect(assign).not.toHaveBeenCalled()
  })

  it('goes back to document navigation after the check is removed', async () => {
    const { assign } = spyDocumentNavigation()
    const removeCheck = registerUnsavedChanges(() => true)
    removeCheck()
    const { navigate } = await renderGuardedRouter()
    navigate()('/en/other')
    flush()
    expect(assign).toHaveBeenCalledWith(
      `${globalThis.location.origin}/en/other`
    )
  })

  it('keeps replace in the document navigation', async () => {
    const { assign, replace } = spyDocumentNavigation()
    const { navigate } = await renderGuardedRouter()
    navigate()('/en/other', { replace: true })
    flush()
    expect(replace).toHaveBeenCalledWith(
      `${globalThis.location.origin}/en/other`
    )
    expect(assign).not.toHaveBeenCalled()
  })

  it.each([
    ['the query', '/en/start?q=1', '/en/start?q=1'],
    ['the hash', '/en/start#part', '/en/start'],
    ['the locale of the same path', '/pt/start', '/pt/start']
  ])(
    'leaves on the client a change of only %s',
    async (_change, href, rendered) => {
      const { assign, replace } = spyDocumentNavigation()
      const { host, navigate } = await renderGuardedRouter()
      navigate()(href)
      await expect.poll(() => host.textContent).toBe(rendered)
      expect(assign).not.toHaveBeenCalled()
      expect(replace).not.toHaveBeenCalled()
    }
  )

  it('leaves on the client going back between entries of the same document', async () => {
    const { assign, replace } = spyDocumentNavigation()
    const history = memoryHistory('/en/start')
    const { host, navigate } = await renderGuardedRouter({ history })
    navigate()('/en/start?q=1')
    await expect.poll(() => host.textContent).toBe('/en/start?q=1')
    history.back()
    await expect.poll(() => host.textContent).toBe('/en/start')
    expect(assign).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('leaves the navigation on the client without a connection', async () => {
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(false)
    const { assign } = spyDocumentNavigation()
    const { host, navigate } = await renderGuardedRouter()
    navigate()('/en/next')
    await expect.poll(() => host.textContent).toBe('/en/next')
    expect(assign).not.toHaveBeenCalled()
  })
})

describe('version error recognition', () => {
  it('recognizes the recorded chunk failure and the unknown function', () => {
    const chunkFailure = new TypeError('Failed to fetch module')
    const unknownFunction = Object.assign(new Error('Refused'), {
      unknownFunction: true
    })
    recordChunkFailure(chunkFailure)
    expect(isVersionError(chunkFailure)).toBe(true)
    expect(isVersionError(unknownFunction)).toBe(true)
  })

  it.each([
    ['a plain error', new Error('Internal detail')],
    ['an error with a false unknownFunction', { unknownFunction: false }],
    ['a string', 'failure'],
    ['undefined', undefined]
  ])('refuses %s', (_case, error) => {
    expect(isVersionError(error)).toBe(false)
  })
})

describe('automatic reload lock', () => {
  beforeEach(() => {
    globalThis.sessionStorage.clear()
  })

  it('allows one reload per window and allows it again after the window', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(START_MS)
    expect(claimOutdatedPageReload()).toBe(true)
    expect(claimOutdatedPageReload()).toBe(false)
    now.mockReturnValue(START_MS + RELOAD_WINDOW_MS - 1)
    expect(claimOutdatedPageReload()).toBe(false)
    now.mockReturnValue(START_MS + RELOAD_WINDOW_MS)
    expect(claimOutdatedPageReload()).toBe(true)
  })

  it.each([
    ['non-numeric', 'x'],
    ['in the future', String(Number.MAX_SAFE_INTEGER)]
  ])('allows the reload with the %s mark', (_case, stored) => {
    globalThis.sessionStorage.setItem('outdated-page-reload', stored)
    expect(claimOutdatedPageReload()).toBe(true)
  })

  // The happy-dom Storage is a Proxy that does not undo the spy; the global stub
  // is restored between the cases.
  it.each([
    ['the read', { getItem: throwBlocked, setItem: writeNothing }],
    ['the write', { getItem: readNothing, setItem: throwBlocked }]
  ])(
    'does not reload when sessionStorage refuses %s',
    (_case, storage: StorageAccess) => {
      vi.stubGlobal('sessionStorage', storage)
      expect(claimOutdatedPageReload()).toBe(false)
    }
  )

  it('does not reload without a connection', () => {
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(false)
    expect(claimOutdatedPageReload()).toBe(false)
    expect(globalThis.sessionStorage.getItem('outdated-page-reload')).toBeNull()
  })
})
