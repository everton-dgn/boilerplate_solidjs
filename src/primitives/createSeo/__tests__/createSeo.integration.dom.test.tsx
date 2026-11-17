import { createRouter, memoryHistory } from '@solidjs/router'
import type { Product } from 'schema-dts'
import { createSignal, Show } from 'solid-js'

import { SITE } from '@/constants/site/index.ts'
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

describe('route SEO and own data in the same Router', () => {
  it('updates and disposes independent owners during navigation and noindex', async () => {
    await vi.waitUntil(() => readScripts().length === 0, POLL)
    const history = memoryHistory('/public')
    const [data, setData] = createSignal<Product | undefined>({
      '@type': 'Product',
      name: 'Initial'
    })
    const [isVisible, setIsVisible] = createSignal(true)
    const [isMounted, setIsMounted] = createSignal(true)

    function ConditionalData() {
      createSeo({ structuredData: data })
      return null
    }

    function Page() {
      createSeo({
        structuredData: () => ({ '@type': 'Product', name: 'Fixed' })
      })
      return (
        <Show when={isVisible()}>
          <ConditionalData />
        </Show>
      )
    }

    const Router = createRouter({
      history,
      routes: [
        { path: '/public', component: Page },
        {
          path: '/restrita',
          info: { seo: { noindex: true } },
          component: Page
        },
        { path: '/empty', component: () => null }
      ]
    })

    renderComponent(
      () => (
        <Show when={isMounted()}>
          <Router>
            {props => {
              createSeo({ route: true })
              return props.children
            }}
          </Router>
        </Show>
      ),
      { hasProviders: false }
    )

    await vi.waitUntil(() => readScripts().length === ALL_SCRIPTS, POLL)
    expectGlobalTags()

    setData({ '@type': 'Product', name: 'Updated' })
    await vi.waitUntil(
      () => hasScript('Updated') && readScripts().length === ALL_SCRIPTS,
      POLL
    )
    setData(undefined)
    await vi.waitUntil(() => readScripts().length === DATA_SCRIPTS, POLL)
    setData({ '@type': 'Product', name: 'Resumed' })
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
    expect([hasScript('Fixed'), hasScript('Resumed')]).toStrictEqual([
      true,
      true
    ])

    setIsVisible(false)
    await vi.waitUntil(() => readScripts().length === 1, POLL)
    expect(readScripts()[0]).toContain('Fixed')
    setIsVisible(true)
    await vi.waitUntil(() => readScripts().length === DATA_SCRIPTS, POLL)

    history.set({ value: '/public', scroll: false })
    await vi.waitUntil(
      () =>
        readCanonical() === `${SITE.url}/en/public` &&
        readScripts().length === ALL_SCRIPTS,
      POLL
    )
    expectGlobalTags()

    history.set({ value: '/empty', scroll: false })
    await vi.waitUntil(
      () =>
        readCanonical() === `${SITE.url}/en/empty` &&
        readScripts().length === 1,
      POLL
    )
    expect([hasScript('Resumed'), hasScript('Fixed')]).toStrictEqual([
      false,
      false
    ])

    setIsMounted(false)
    await vi.waitUntil(
      () => readScripts().length === 0 && !readCanonical(),
      POLL
    )
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })
})
