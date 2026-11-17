import {
  createRouter,
  formAction,
  memoryHistory,
  query,
  useLocation,
  useNavigate,
  type MemoryHistoryAdapter
} from '@solidjs/router'
import {
  createMemo,
  createSignal,
  flush,
  Loading,
  type Component
} from 'solid-js'

import { localizedRedirect } from '@/i18n/localizedRedirect/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { createLocaleNavigationGuard } from '../index.ts'

type GuardedRouterOptions = {
  history: MemoryHistoryAdapter
  page: Component
}

function renderGuardedRouter({
  history,
  page
}: GuardedRouterOptions): HTMLDivElement {
  const Router = createRouter({
    history,
    routes: [{ path: '*all', component: page }]
  })
  return renderComponent(
    () => (
      <Router>
        {props => {
          createLocaleNavigationGuard()
          return props.children
        }}
      </Router>
    ),
    { hasProviders: false }
  )
}

describe('locale navigation guard', () => {
  it('blocks cross-locale SPA writes and preserves redirect replace and URL suffixes', async () => {
    const replace = vi
      .spyOn(globalThis.location, 'replace')
      .mockImplementation(() => {
        /* Stays in the test document. */
      })
    const assign = vi
      .spyOn(globalThis.location, 'assign')
      .mockImplementation(() => {
        /* Stays in the test document. */
      })
    const history = memoryHistory('/en/start')
    let navigate: ReturnType<typeof useNavigate> | undefined
    function Page() {
      navigate = useNavigate()
      const location = useLocation()
      return <output>{location.pathname}</output>
    }
    const host = renderGuardedRouter({ history, page: Page })
    await expect.poll(() => host.textContent).toBe('/en/start')
    assert(navigate)
    navigate('/es/destination?q=1#part', { replace: true })
    flush()
    expect(replace).toHaveBeenCalledWith(
      `${globalThis.location.origin}/es/destination?q=1#part`
    )
    navigate('/pt/destination?q=2#part')
    flush()
    expect(assign).toHaveBeenCalledWith(
      `${globalThis.location.origin}/pt/destination?q=2#part`
    )
    expect(host.textContent).toBe('/en/start')
    navigate('/en/next')
    await expect.poll(() => host.textContent).toBe('/en/next')
    history.back()
    await expect.poll(() => host.textContent).toBe('/en/start')
  })

  it('keeps same-locale navigation, state and back/forward in the Router', async () => {
    const history = memoryHistory('/en/start')
    let navigate: ReturnType<typeof useNavigate> | undefined
    function Page() {
      navigate = useNavigate()
      const location = useLocation()
      return (
        <output data-state={JSON.stringify(location.state)}>
          {location.pathname}
          {location.search}
          {location.hash}
        </output>
      )
    }
    const host = renderGuardedRouter({ history, page: Page })
    await expect.poll(() => host.textContent).toBe('/en/start')
    assert(navigate)
    navigate('/en/next?q=1#part', { state: { marker: 'kept' } })
    await expect.poll(() => host.textContent).toBe('/en/next?q=1#part')
    expect(host.querySelector('output')?.dataset.state).toBe(
      '{"marker":"kept"}'
    )
    history.back()
    await expect.poll(() => host.textContent).toBe('/en/start')
    history.forward()
    await expect.poll(() => host.textContent).toBe('/en/next?q=1#part')
  })
})

describe('locale guard with Router response processing', () => {
  it('turns a form action Response redirect into a document replacement', async () => {
    const replace = vi
      .spyOn(globalThis.location, 'replace')
      .mockImplementation(() => {
        /* Watches the call without leaving the test. */
      })
    const submit = formAction(
      () =>
        Promise.resolve(
          localizedRedirect({
            href: '/destination?q=action#part',
            locale: 'es'
          })
        ),
      'locale-guard-action-test'
    )
    // The router action only receives its context when it is bound to a form;
    // the submission goes through the same redirect handling.
    function Page() {
      return (
        <form action={submit} method="post">
          <button type="submit">Ready</button>
        </form>
      )
    }
    const host = renderGuardedRouter({
      history: memoryHistory('/en/start'),
      page: Page
    })
    await expect.poll(() => host.textContent).toBe('Ready')
    const button = host.querySelector('button')
    assert(button)
    button.click()
    await expect
      .poll(() => replace.mock.lastCall?.[0])
      .toBe(`${globalThis.location.origin}/es/destination?q=action#part`)
  })

  it('turns a query Response redirect into a document replacement', async () => {
    const replace = vi
      .spyOn(globalThis.location, 'replace')
      .mockImplementation(() => {
        /* Watches the call without leaving the test. */
      })
    const read = query(
      () =>
        Promise.resolve(
          localizedRedirect({ href: '/destination?q=query#part', locale: 'pt' })
        ),
      'locale-guard-query-test'
    )
    let request: (() => void) | undefined
    function Page() {
      const [isRequested, setIsRequested] = createSignal(false)
      request = () => {
        setIsRequested(true)
      }
      const value = createMemo(() => (isRequested() ? read() : ''))
      return (
        <>
          <p>Ready</p>
          <Loading fallback={<p>Redirecting</p>}>
            <span>{value()}</span>
          </Loading>
        </>
      )
    }
    const host = renderGuardedRouter({
      history: memoryHistory('/en/start'),
      page: Page
    })
    await expect.poll(() => host.textContent).toBe('Ready')
    assert(request)
    request()
    await expect
      .poll(() => replace.mock.lastCall?.[0])
      .toBe(`${globalThis.location.origin}/pt/destination?q=query#part`)
  })
})
