import { createRouter, memoryHistory, useNavigate } from '@solidjs/router'

import { resolveRouteSeo } from '@/helpers/resolveRouteSeo/index.ts'
import { POLL, readCanonical } from '@/tests/helpers/headTags/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { createSeo } from '../index.ts'

vi.mock(import('@/helpers/resolveRouteSeo/index.ts'), { spy: true })

const TWO_ROUTES = 2

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
