import { createRouter, memoryHistory, useLocation } from '@solidjs/router'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { createLocalizedNavigate } from '../index.ts'

describe('createLocalizedNavigate contracts', () => {
  it('resolves fragments and empty hrefs against the nested current page and query', async () => {
    let navigate: ReturnType<typeof createLocalizedNavigate> | undefined
    function Page() {
      navigate = createLocalizedNavigate()
      const location = useLocation()
      return (
        <output>
          {location.pathname}
          {location.search}
          {location.hash}
        </output>
      )
    }
    const Router = createRouter({
      history: memoryHistory('/pt/docs/chapter?filter=active#old'),
      routes: [{ path: '*all', component: Page }]
    })
    const host = renderComponent(
      () => <Router>{props => props.children}</Router>,
      { providers: false }
    )
    await expect
      .poll(() => host.textContent)
      .toBe('/pt/docs/chapter?filter=active#old')
    assert(navigate)
    navigate({ href: '#section' })
    await expect
      .poll(() => host.textContent)
      .toBe('/pt/docs/chapter?filter=active#section')
    navigate({ href: '' })
    await expect
      .poll(() => host.textContent)
      .toBe('/pt/docs/chapter?filter=active')
  })

  it('navigates in the Router with query/hash, relative URLs, and state', async () => {
    let navigate: ReturnType<typeof createLocalizedNavigate> | undefined
    function Page() {
      navigate = createLocalizedNavigate()
      const location = useLocation()
      return (
        <output>
          {location.pathname}
          {location.search}
          {location.hash}
        </output>
      )
    }
    const Router = createRouter({
      history: memoryHistory('/pt/docs/start'),
      routes: [{ path: '*all', component: Page }]
    })
    const host = renderComponent(
      () => <Router>{props => props.children}</Router>,
      { providers: false }
    )
    await expect.poll(() => host.textContent).toBe('/pt/docs/start')
    assert(navigate)
    navigate({
      href: '../next?q=1#part',
      locale: 'pt',
      state: { source: 'test' },
      replace: true
    })
    await expect.poll(() => host.textContent).toBe('/pt/next?q=1#part')
    navigate({ href: '/es/final', locale: 'pt' })
    await expect.poll(() => host.textContent).toBe('/pt/final')
  })

  it('uses document navigation for a different locale, external URLs, and endpoints', async () => {
    const assign = vi
      .spyOn(globalThis.location, 'assign')
      .mockImplementation(() => {
        /* Keep this test in its document. */
      })
    const replace = vi
      .spyOn(globalThis.location, 'replace')
      .mockImplementation(() => {
        /* Keep this test in its document. */
      })
    let navigate: ReturnType<typeof createLocalizedNavigate> | undefined
    function Page() {
      navigate = createLocalizedNavigate()
      return <p>Ready</p>
    }
    const Router = createRouter({
      history: memoryHistory('/pt/docs'),
      routes: [{ path: '*all', component: Page }]
    })
    const host = renderComponent(
      () => <Router>{props => props.children}</Router>,
      { providers: false }
    )
    await expect.poll(() => host.textContent).toBe('Ready')
    assert(navigate)
    navigate({ href: '/docs?q=1#part', locale: 'en' })
    expect(assign).toHaveBeenLastCalledWith('/en/docs?q=1#part')
    navigate({ href: '/api/report', localize: false, replace: true })
    expect(replace).toHaveBeenCalledWith('/api/report')
    navigate({ href: 'https://example.com' })
    expect(assign).toHaveBeenLastCalledWith('https://example.com')
  })
})
