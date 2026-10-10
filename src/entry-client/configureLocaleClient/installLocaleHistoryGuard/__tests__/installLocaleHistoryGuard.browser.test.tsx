import { createRouter, useLocation } from '@solidjs/router'
import { render } from '@solidjs/web'

import { createLocaleNavigationGuard } from '@/router/createLocaleNavigationGuard/index.ts'

import { installLocaleHistoryGuard } from '../index.ts'

function Page() {
  const location = useLocation()
  return <output>{location.pathname}</output>
}

describe('document locale history guard in a real browser', () => {
  it('runs before the Router and keeps the selected index and history length', async () => {
    const originalUrl = globalThis.location.href
    const originalState: unknown = globalThis.history.state
    const order: string[] = []
    globalThis.history.replaceState({ position: 'start' }, '', '/pt/start')
    const stopGuard = installLocaleHistoryGuard(() => {
      order.push('reload')
    })
    // Default history installs the real Router popstate listener after ours.
    const Router = createRouter({ routes: [{ path: '*all', component: Page }] })
    const host = document.createElement('div')
    document.body.append(host)
    const dispose = render(
      () => (
        <Router>
          {props => {
            createLocaleNavigationGuard()
            return props.children
          }}
        </Router>
      ),
      host
    )
    const observe = () => {
      order.push('observer')
    }
    globalThis.addEventListener('popstate', observe)
    onTestFinished(() => {
      stopGuard()
      dispose()
      globalThis.removeEventListener('popstate', observe)
      globalThis.history.replaceState(originalState, '', originalUrl)
      host.remove()
    })
    await expect.poll(() => host.textContent).toBe('/pt/start')
    globalThis.history.pushState(
      { position: 'spanish' },
      '',
      '/es/destination?q=1#part'
    )
    globalThis.history.pushState({ position: 'portuguese' }, '', '/pt/end')
    const { length } = globalThis.history
    globalThis.history.back()
    await expect.poll(() => order).toStrictEqual(['reload'])
    expect({
      path:
        globalThis.location.pathname +
        globalThis.location.search +
        globalThis.location.hash,
      state: globalThis.history.state as unknown,
      length: globalThis.history.length,
      rendered: host.textContent
    }).toStrictEqual({
      path: '/es/destination?q=1#part',
      state: { position: 'spanish' },
      length,
      rendered: '/pt/start'
    })
    // A rollback would have moved away from the Spanish entry; forward must
    // select precisely the Portuguese entry without creating another entry.
    globalThis.history.forward()
    await expect.poll(() => host.textContent).toBe('/pt/end')
    expect({
      order,
      state: globalThis.history.state as unknown,
      length: globalThis.history.length
    }).toMatchObject({
      order: ['reload', 'observer'],
      state: { position: 'portuguese' },
      length
    })
  })

  it('removes its listener when disposed', () => {
    const originalUrl = globalThis.location.href
    const state: unknown = globalThis.history.state
    onTestFinished(() =>
      globalThis.history.replaceState(state, '', originalUrl)
    )
    globalThis.history.replaceState(null, '', '/pt/start')
    const reload = vi.fn<() => void>()
    const stop = installLocaleHistoryGuard(reload)
    stop()
    globalThis.history.replaceState(null, '', '/es/end')
    globalThis.dispatchEvent(new PopStateEvent('popstate'))
    expect(reload).not.toHaveBeenCalled()
  })
})
