import { createRouter, memoryHistory, useNavigate } from '@solidjs/router'

import { resolveRouteSeo } from '@/helpers/resolveRouteSeo/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { createSeo } from '../index.ts'

vi.mock(import('@/helpers/resolveRouteSeo/index.ts'), { spy: true })

// vi.waitUntil não lê test.expect.poll e espera 50ms por padrão.
const POLL = { interval: 10 }
const TWO_ROUTES = 2

function readCanonical(): string | null {
  return (
    document.head
      .querySelector('link[rel="canonical"]')
      ?.getAttribute('href') ?? null
  )
}

describe('cálculo do SEO da rota', () => {
  it('resolve os metadados uma vez por rota em vez de uma vez por tag', async () => {
    let navigate: ReturnType<typeof useNavigate> | undefined
    const Router = createRouter({
      routes: [
        {
          path: '/*rest',
          info: { markdown: true },
          component: () => {
            navigate = useNavigate()
            return null
          }
        }
      ],
      history: memoryHistory('/')
    })
    renderComponent(
      () => (
        <Router>
          {props => {
            createSeo({ route: true })
            return props.children
          }}
        </Router>
      ),
      { providers: false }
    )
    await vi.waitUntil(() => readCanonical()?.endsWith('/en') === true, POLL)
    expect(resolveRouteSeo).toHaveBeenCalledOnce()
    assert(navigate)
    navigate('/docs')
    await vi.waitUntil(
      () => readCanonical()?.endsWith('/en/docs') === true,
      POLL
    )
    expect(resolveRouteSeo).toHaveBeenCalledTimes(TWO_ROUTES)
  })
})
