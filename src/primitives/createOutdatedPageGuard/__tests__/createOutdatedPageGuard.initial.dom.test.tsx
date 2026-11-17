import {
  createRouter,
  memoryHistory,
  useLocation,
  useNavigate
} from '@solidjs/router'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { createOutdatedPageGuard } from '../index.ts'

type Navigate = ReturnType<typeof useNavigate>

// Its own file: Vitest isolates the module per file, and no other case marks the
// page before this one.
describe('guard of a page that is still current', () => {
  it('keeps the navigation on the client while nothing has marked the page', async () => {
    const assign = vi
      .spyOn(globalThis.location, 'assign')
      .mockImplementation(() => {
        /* Stays in the test document. */
      })
    let navigate: Navigate | undefined
    function Page() {
      navigate = useNavigate()
      const location = useLocation()
      return <output>{location.pathname}</output>
    }
    const Router = createRouter({
      history: memoryHistory('/en/start'),
      routes: [{ path: '*all', component: Page }]
    })
    const host = renderComponent(
      () => (
        <Router>
          {props => {
            createOutdatedPageGuard()
            return props.children
          }}
        </Router>
      ),
      { hasProviders: false }
    )
    await expect.poll(() => host.textContent).toBe('/en/start')
    assert(navigate)
    navigate('/en/next')
    await expect.poll(() => host.textContent).toBe('/en/next')
    expect(assign).not.toHaveBeenCalled()
  })
})
