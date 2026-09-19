import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { ErrorFallback } from '../index.tsx'

describe('navegação após falha', () => {
  it('mantém os parâmetros da página no recarregamento sem depender do Router', () => {
    const previousUrl = globalThis.location.href
    const previousState: unknown = globalThis.history.state
    onTestFinished(() => {
      globalThis.history.replaceState(previousState, '', previousUrl)
    })
    globalThis.history.replaceState(null, '', '/?filter=active&page=2')

    const host = renderComponent(() => <ErrorFallback kind="runtime" />, {
      providers: false
    })
    const reload = host.querySelector<HTMLAnchorElement>('a')
    assert(reload)
    expect(reload.href).toBe(globalThis.location.href)
    expect(reload.target).toBe('_self')
  })

  it('oferece voltar ao início quando a página não existe', () => {
    const host = renderComponent(() => <ErrorFallback kind="not-found" />, {
      providers: false
    })
    const home = host.querySelector<HTMLAnchorElement>('a')
    assert(home)
    expect(home.textContent).toBe('Voltar ao início')
    expect(new URL(home.href).pathname).toBe('/')
  })
})
