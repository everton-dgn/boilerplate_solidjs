import { createRouter, memoryHistory } from '@solidjs/router'
import type { Product } from 'schema-dts'
import { createSignal, Show } from 'solid-js'

import { SITE } from '@/constants/site.ts'
import {
  POLL,
  readCanonical,
  readScripts
} from '@/tests/helpers/headTags/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { createSeo } from '../index.ts'

const DATA_SCRIPTS = 2
const ALL_SCRIPTS = 3

function hasScript(text: string): boolean {
  return readScripts().some(json => json.includes(text))
}

function expectGlobalTags(): void {
  expect([
    document.head.querySelectorAll('title').length,
    document.head.querySelectorAll('link[rel="canonical"]').length,
    document.head.querySelectorAll('meta[name="robots"]').length,
    readScripts().filter(json => json.includes('"@type":"WebSite"')).length
  ]).toStrictEqual([1, 1, 1, 1])
}

describe('seo de rota e dados próprios no mesmo Router', () => {
  it('atualiza e descarta owners independentes durante navegação e noindex', async () => {
    await vi.waitUntil(() => readScripts().length === 0, POLL)
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

    await vi.waitUntil(() => readScripts().length === ALL_SCRIPTS, POLL)
    expectGlobalTags()

    setData({ '@type': 'Product', name: 'Atualizado' })
    await vi.waitUntil(
      () => hasScript('Atualizado') && readScripts().length === ALL_SCRIPTS,
      POLL
    )
    setData(undefined)
    await vi.waitUntil(() => readScripts().length === DATA_SCRIPTS, POLL)
    setData({ '@type': 'Product', name: 'Retomado' })
    await vi.waitUntil(() => readScripts().length === ALL_SCRIPTS, POLL)

    history.set({ value: '/restrita', scroll: false })
    await vi.waitUntil(
      () => readScripts().length === DATA_SCRIPTS && !readCanonical(),
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
    await vi.waitUntil(() => readScripts().length === 1, POLL)
    expect(readScripts()[0]).toContain('Fixo')
    setVisible(true)
    await vi.waitUntil(() => readScripts().length === DATA_SCRIPTS, POLL)

    history.set({ value: '/publica', scroll: false })
    await vi.waitUntil(
      () =>
        readCanonical() === `${SITE.url}/en/publica` &&
        readScripts().length === ALL_SCRIPTS,
      POLL
    )
    expectGlobalTags()

    history.set({ value: '/vazia', scroll: false })
    await vi.waitUntil(
      () =>
        readCanonical() === `${SITE.url}/en/vazia` &&
        readScripts().length === 1,
      POLL
    )
    expect([hasScript('Retomado'), hasScript('Fixo')]).toStrictEqual([
      false,
      false
    ])

    setMounted(false)
    await vi.waitUntil(
      () => readScripts().length === 0 && !readCanonical(),
      POLL
    )
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })
})
