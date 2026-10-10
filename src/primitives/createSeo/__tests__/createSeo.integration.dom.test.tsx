import { createRouter, memoryHistory } from '@solidjs/router'
import type { Product } from 'schema-dts'
import { createSignal, Show } from 'solid-js'

import { SITE } from '@/constants/site.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { createSeo } from '../index.ts'

// vi.waitUntil não lê test.expect.poll e espera 50ms por padrão.
const POLL = { interval: 10 }
const DATA_SCRIPTS = 2
const ALL_SCRIPTS = 3

function scripts(): string[] {
  return [
    ...document.head.querySelectorAll('script[type="application/ld+json"]')
  ].map(script => script.textContent)
}

function canonical(): string | null | undefined {
  return document.head
    .querySelector('link[rel="canonical"]')
    ?.getAttribute('href')
}

function hasScript(text: string): boolean {
  return scripts().some(json => json.includes(text))
}

function expectGlobalTags(): void {
  expect([
    document.head.querySelectorAll('title').length,
    document.head.querySelectorAll('link[rel="canonical"]').length,
    document.head.querySelectorAll('meta[name="robots"]').length,
    scripts().filter(json => json.includes('"@type":"WebSite"')).length
  ]).toStrictEqual([1, 1, 1, 1])
}

describe('seo de rota e dados próprios no mesmo Router', () => {
  it('atualiza e descarta owners independentes durante navegação e noindex', async () => {
    await vi.waitUntil(() => scripts().length === 0, POLL)
    const history = memoryHistory('/publica')
    const [data, setData] = createSignal<Product | undefined>({
      '@type': 'Product',
      name: 'Inicial'
    })
    const [visible, setVisible] = createSignal(true)
    const [mounted, setMounted] = createSignal(true)

    function ConditionalData() {
      createSeo({ structuredData: data })
      return null
    }

    function Page() {
      createSeo({
        structuredData: () => ({ '@type': 'Product', name: 'Fixo' })
      })
      return (
        <Show when={visible()}>
          <ConditionalData />
        </Show>
      )
    }

    const Router = createRouter({
      history,
      routes: [
        { path: '/publica', component: Page },
        {
          path: '/restrita',
          info: { seo: { noindex: true } },
          component: Page
        },
        { path: '/vazia', component: () => null }
      ]
    })

    renderComponent(
      () => (
        <Show when={mounted()}>
          <Router>
            {props => {
              createSeo({ route: true })
              return props.children
            }}
          </Router>
        </Show>
      ),
      { providers: false }
    )

    await vi.waitUntil(() => scripts().length === ALL_SCRIPTS, POLL)
    expectGlobalTags()

    setData({ '@type': 'Product', name: 'Atualizado' })
    await vi.waitUntil(
      () => hasScript('Atualizado') && scripts().length === ALL_SCRIPTS,
      POLL
    )
    setData(undefined)
    await vi.waitUntil(() => scripts().length === DATA_SCRIPTS, POLL)
    setData({ '@type': 'Product', name: 'Retomado' })
    await vi.waitUntil(() => scripts().length === ALL_SCRIPTS, POLL)

    history.set({ value: '/restrita', scroll: false })
    await vi.waitUntil(
      () => scripts().length === DATA_SCRIPTS && !canonical(),
      POLL
    )
    expect(
      document.head
        .querySelector('meta[name="robots"]')
        ?.getAttribute('content')
    ).toBe('noindex')
    expect([hasScript('Fixo'), hasScript('Retomado')]).toStrictEqual([
      true,
      true
    ])

    setVisible(false)
    await vi.waitUntil(() => scripts().length === 1, POLL)
    expect(scripts()[0]).toContain('Fixo')
    setVisible(true)
    await vi.waitUntil(() => scripts().length === DATA_SCRIPTS, POLL)

    history.set({ value: '/publica', scroll: false })
    await vi.waitUntil(
      () =>
        canonical() === `${SITE.url}/pt/publica` &&
        scripts().length === ALL_SCRIPTS,
      POLL
    )
    expectGlobalTags()

    history.set({ value: '/vazia', scroll: false })
    await vi.waitUntil(
      () => canonical() === `${SITE.url}/pt/vazia` && scripts().length === 1,
      POLL
    )
    expect([hasScript('Retomado'), hasScript('Fixo')]).toStrictEqual([
      false,
      false
    ])

    setMounted(false)
    await vi.waitUntil(() => scripts().length === 0 && !canonical(), POLL)
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })
})
