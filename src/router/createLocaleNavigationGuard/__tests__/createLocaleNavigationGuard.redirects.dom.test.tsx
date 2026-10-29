import { createRouter, formAction, memoryHistory, query } from '@solidjs/router'
import { createMemo, createSignal, Loading } from 'solid-js'

import { localizedRedirect } from '@/i18n/localizedRedirect/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { createLocaleNavigationGuard } from '../index.ts'

describe('locale guard with Router response processing', () => {
  it('turns a form action Response redirect into a document replacement', async () => {
    const replace = vi
      .spyOn(globalThis.location, 'replace')
      .mockImplementation(() => {
        /* Observa a chamada sem sair do teste. */
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
    // A ação do router só recebe o contexto dele quando está ligada a um
    // formulário; o envio passa pelo mesmo tratamento de redirect.
    function Page() {
      return (
        <form action={submit} method="post">
          <button type="submit">Ready</button>
        </form>
      )
    }
    const Router = createRouter({
      history: memoryHistory('/en/start'),
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
        /* Observa a chamada sem sair do teste. */
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
      history: memoryHistory('/en/start'),
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
      .toBe(`${globalThis.location.origin}/pt/destination?q=query#part`)
  })
})
