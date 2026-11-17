import { m } from '@paraglide/messages.js'
import { createSignal, Errored } from 'solid-js'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { ErrorFallback } from '../index.tsx'
import type { ErrorFallbackKind } from '../types.ts'

function readMeta(name: string): string | null {
  return (
    document.head
      .querySelector(`meta[name="${name}"]`)
      ?.getAttribute('content') ?? null
  )
}

function FailingPage(): never {
  throw new Error('Failure before the Router')
}

describe('failure metadata', () => {
  it('publishes the title, description and noindex when the failure happens before the Router', async () => {
    await expect.poll(() => readMeta('robots')).toBeNull()
    // In development, Errored logs the caught error to the console.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(vi.fn())
    const host = renderComponent(
      () => (
        <Errored fallback={() => <ErrorFallback kind="runtime" />}>
          <FailingPage />
        </Errored>
      ),
      { hasProviders: false }
    )
    await expect.poll(() => readMeta('robots')).toBe('noindex')
    expect(document.title).toBe(m.errorFallback_runtimeTitle())
    expect(readMeta('description')).toBe(m.errorFallback_runtimeDescription())
    expect(host.querySelector('h1')).toHaveTextContent(
      m.errorFallback_runtimeTitle()
    )
    expect(consoleError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Failure before the Router' })
    )
  })

  it('removes the failure metadata when the variant becomes a missing page', async () => {
    const [kind, setKind] = createSignal<ErrorFallbackKind>('runtime')
    renderComponent(() => <ErrorFallback kind={kind()} />, {
      hasProviders: false
    })
    await expect.poll(() => readMeta('robots')).toBe('noindex')
    setKind('not-found')
    await expect.poll(() => readMeta('robots')).toBeNull()
    expect(readMeta('description')).toBeNull()
  })
})

describe('navigation after a failure', () => {
  it('keeps the page parameters on reload without depending on the Router', () => {
    const previousUrl = globalThis.location.href
    const previousState: unknown = globalThis.history.state
    onTestFinished(() => {
      globalThis.history.replaceState(previousState, '', previousUrl)
    })
    globalThis.history.replaceState(null, '', '/?filter=active&page=2')

    const host = renderComponent(() => <ErrorFallback kind="runtime" />, {
      hasProviders: false
    })
    const reload = host.querySelector<HTMLAnchorElement>('a')
    assert(reload)
    expect(reload.href).toBe(globalThis.location.href)
    expect(reload.target).toBe('_self')
  })

  it('offers going back to the start when the page does not exist', () => {
    const host = renderComponent(() => <ErrorFallback kind="not-found" />, {
      hasProviders: false
    })
    const home = host.querySelector<HTMLAnchorElement>('a')
    assert(home)
    expect(home.textContent).toBe('Back to home')
    expect(new URL(home.href).pathname).toBe('/en')
  })

  it('replaces the icon when the variant changes and restores the previous icon', async () => {
    const [kind, setKind] = createSignal<ErrorFallbackKind>('not-found')
    const host = renderComponent(() => <ErrorFallback kind={kind()} />, {
      hasProviders: false
    })
    const firstIcon = host.querySelector('a svg')?.outerHTML
    expect(firstIcon).toBeDefined()

    setKind('runtime')
    await expect
      .poll(() => host.querySelector('a')?.textContent)
      .toBe('Reload page')
    const runtimeIcon = host.querySelector('a svg')?.outerHTML
    expect(runtimeIcon).toBeDefined()
    expect(runtimeIcon).not.toBe(firstIcon)

    setKind('not-found')
    await expect
      .poll(() => host.querySelector('a svg')?.outerHTML)
      .toBe(firstIcon)
    expect(host.querySelectorAll('a svg')).toHaveLength(1)
  })
})
