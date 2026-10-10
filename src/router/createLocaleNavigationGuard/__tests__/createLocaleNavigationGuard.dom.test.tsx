import {
  createRouter,
  memoryHistory,
  useLocation,
  useNavigate
} from '@solidjs/router'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { createLocaleNavigationGuard } from '../index.ts'

describe('locale navigation guard', () => {
  it('blocks cross-locale SPA writes and preserves redirect replace and URL suffixes', async () => {
    const replace = vi
      .spyOn(globalThis.location, 'replace')
      .mockImplementation(() => {
        /* Stay in the test document. */
      })
    const assign = vi
      .spyOn(globalThis.location, 'assign')
      .mockImplementation(() => {
        /* Stay in the test document. */
      })
    let navigate: ReturnType<typeof useNavigate> | undefined
    function Page() {
      navigate = useNavigate()
      const location = useLocation()
      return <output>{location.pathname}</output>
    }
    const Router = createRouter({
      history: memoryHistory('/pt/start'),
      routes: [{ path: '*all', component: Page }]
    })
    const host = renderComponent(
      () => (
        <Router>
          {props => {
            createLocaleNavigationGuard()
            return props.children
          }}
        </Router>
      ),
      { providers: false }
    )
    await expect.poll(() => host.textContent).toBe('/pt/start')
    assert(navigate)
    navigate('/es/destination?q=1#part', { replace: true })
    expect(replace).toHaveBeenCalledWith(
      `${globalThis.location.origin}/es/destination?q=1#part`
    )
    navigate('/en/destination?q=2#part')
    expect(assign).toHaveBeenCalledWith(
      `${globalThis.location.origin}/en/destination?q=2#part`
    )
    expect(host.textContent).toBe('/pt/start')
  })

  it('keeps same-locale navigation, state and back/forward in the Router', async () => {
    const history = memoryHistory('/pt/start')
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
    const Router = createRouter({
      history,
      routes: [{ path: '*all', component: Page }]
    })
    const host = renderComponent(
      () => (
        <Router>
          {props => {
            createLocaleNavigationGuard()
            return props.children
          }}
        </Router>
      ),
      { providers: false }
    )
    await expect.poll(() => host.textContent).toBe('/pt/start')
    assert(navigate)
    navigate('/pt/next?q=1#part', { state: { marker: 'kept' } })
    await expect.poll(() => host.textContent).toBe('/pt/next?q=1#part')
    expect(host.querySelector('output')?.dataset.state).toBe(
      '{"marker":"kept"}'
    )
    history.back()
    await expect.poll(() => host.textContent).toBe('/pt/start')
    history.forward()
    await expect.poll(() => host.textContent).toBe('/pt/next?q=1#part')
  })
})
