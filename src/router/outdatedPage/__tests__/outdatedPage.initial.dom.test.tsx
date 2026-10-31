import {
  createRouter,
  memoryHistory,
  useLocation,
  useNavigate
} from '@solidjs/router'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { createOutdatedPageGuard } from '../index.ts'

type Navigate = ReturnType<typeof useNavigate>

// Arquivo próprio: o Vitest isola o módulo por arquivo, e nenhum outro caso
// marca a página antes deste.
describe('guard de página ainda atual', () => {
  it('mantém a navegação no client enquanto nada marcou a página', async () => {
    const assign = vi
      .spyOn(globalThis.location, 'assign')
      .mockImplementation(() => {
        /* Permanece no documento do teste. */
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
      { providers: false }
    )
    await expect.poll(() => host.textContent).toBe('/en/start')
    assert(navigate)
    navigate('/en/next')
    await expect.poll(() => host.textContent).toBe('/en/next')
    expect(assign).not.toHaveBeenCalled()
  })
})
