import {
  action,
  createRouter,
  memoryHistory,
  query,
  useAction
} from '@solidjs/router'
import { createMemo, createSignal, Loading } from 'solid-js'

import { localizedRedirect } from '@/i18n/localizedRedirect/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { createLocaleNavigationGuard } from '../index.ts'

describe('locale guard with Router response processing', () => {
  it('turns an action Response redirect into a document replacement', async () => {
    const replace = vi
      .spyOn(globalThis.location, 'replace')
      .mockImplementation(() => {
        /* Observe without leaving the test. */
      })
    const submit = action(
      () =>
        Promise.resolve(
          localizedRedirect({
            href: '/destination?q=action#part',
            locale: 'es'
          })
        ),
      'locale-guard-action-test'
    )
    let run: ReturnType<typeof useAction<[], Response, unknown>> | undefined
    function Page() {
      run = useAction(submit)
      return <p>Ready</p>
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
    await expect.poll(() => host.textContent).toBe('Ready')
    assert(run)
    await run()
    expect(replace).toHaveBeenCalledWith(
      `${globalThis.location.origin}/es/destination?q=action#part`
    )
  })

  it('turns a query Response redirect into a document replacement', async () => {
    const replace = vi
      .spyOn(globalThis.location, 'replace')
      .mockImplementation(() => {
        /* Observe without leaving the test. */
      })
    const read = query(
      () =>
        Promise.resolve(
          localizedRedirect({ href: '/destination?q=query#part', locale: 'en' })
        ),
      'locale-guard-query-test'
    )
    let request: (() => void) | undefined
    function Page() {
      const [requested, setRequested] = createSignal(false)
      request = () => {
        setRequested(true)
      }
      const value = createMemo(() => (requested() ? read() : ''))
      return (
        <>
          <p>Ready</p>
          <Loading fallback={<p>Redirecting</p>}>
            <span>{value()}</span>
          </Loading>
        </>
      )
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
    await expect.poll(() => host.textContent).toBe('Ready')
    assert(request)
    request()
    await expect
      .poll(() => replace.mock.lastCall?.[0])
      .toBe(`${globalThis.location.origin}/en/destination?q=query#part`)
  })
})
