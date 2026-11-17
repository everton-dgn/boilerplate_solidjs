import type { Product } from 'schema-dts'
import { createSignal, Show } from 'solid-js'
import * as v from 'valibot'

import { UNSAFE_JSON_LD_TEXT } from '@/tests/fixtures/structured-data.ts'
import { POLL, readScripts } from '@/tests/helpers/headTags/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { createSeo } from '../index.ts'

const INSTANCES = 2
const NodeSchema = v.record(v.string(), v.unknown())

type StructuredDataAccessor = NonNullable<
  Parameters<typeof createSeo>[0]['structuredData']
>

function mountData(accessors: StructuredDataAccessor[]): void {
  renderComponent(
    () => {
      for (const accessor of accessors) createSeo({ structuredData: accessor })
      return null
    },
    { hasProviders: false }
  )
}

function parseNode(json: string | undefined): Record<string, unknown> {
  return v.parse(NodeSchema, JSON.parse(json ?? 'null'))
}

// The head registry applies and removes the tags in a microtask after the effects.
async function waitForScripts(count: number): Promise<string[]> {
  await vi.waitUntil(() => readScripts().length === count, POLL)
  return readScripts()
}

describe('structured data published by the page', () => {
  beforeEach(async () => {
    await waitForScripts(0)
  })

  it('wraps a node with @context and publishes it in the head', async () => {
    mountData([() => ({ '@type': 'FAQPage', name: 'Questions' })])

    const [json] = await waitForScripts(1)
    expect(parseNode(json)).toStrictEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      name: 'Questions'
    })
  })

  it('publishes a list of nodes as @graph', async () => {
    // `as const` proves that a `readonly` list is accepted.
    const nodes = [
      { '@type': 'Organization', name: 'Acme' },
      { '@type': 'Person', name: 'Ana' }
    ] as const
    mountData([() => nodes])

    const [json] = await waitForScripts(1)
    expect(parseNode(json)).toStrictEqual({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: 'Acme' },
        { '@type': 'Person', name: 'Ana' }
      ]
    })
  })

  it('keeps one script per instance', async () => {
    mountData([
      () => ({ '@type': 'Product', name: 'First' }),
      () => ({ '@type': 'Product', name: 'Second' })
    ])

    const scripts = await waitForScripts(INSTANCES)
    expect(scripts.map(json => parseNode(json).name)).toStrictEqual([
      'First',
      'Second'
    ])
  })

  it('updates the script when the data changes and removes it on unmount', async () => {
    const [data, setData] = createSignal<Product>({
      '@type': 'Product',
      name: 'Before'
    })
    const [isMounted, setIsMounted] = createSignal(true)

    function ProductData() {
      createSeo({ structuredData: data })
      return null
    }

    renderComponent(
      () => (
        <Show when={isMounted()}>
          <ProductData />
        </Show>
      ),
      { hasProviders: false }
    )
    await waitForScripts(1)

    setData({ '@type': 'Product', name: 'After' })
    await vi.waitUntil(() => readScripts()[0]?.includes('After'), POLL)
    expect(readScripts()).toHaveLength(1)

    setIsMounted(false)
    await waitForScripts(0)
    expect(readScripts()).toHaveLength(0)
  })

  it('publishes, removes and publishes the data again without affecting another instance', async () => {
    const [data, setData] = createSignal<Product>()

    function ProductData() {
      createSeo({
        structuredData: () => ({ '@type': 'Product', name: 'Fixed' })
      })
      createSeo({ structuredData: data })
      return null
    }

    renderComponent(ProductData, { hasProviders: false })
    const [fixed] = await waitForScripts(1)
    expect(parseNode(fixed).name).toBe('Fixed')

    setData({ '@type': 'Product', name: 'Conditional' })
    const published = await waitForScripts(INSTANCES)
    expect(published.map(json => parseNode(json).name)).toContain('Conditional')

    setData(undefined)
    await expect(waitForScripts(1)).resolves.toStrictEqual([fixed])

    setData({ '@type': 'Product', name: 'Resumed' })
    const resumed = await waitForScripts(INSTANCES)
    expect(resumed.map(json => parseNode(json).name)).toStrictEqual(
      expect.arrayContaining(['Fixed', 'Resumed'])
    )
  })

  it('inserts the JSON as text without creating elements from the data', async () => {
    mountData([() => ({ '@type': 'Thing', name: UNSAFE_JSON_LD_TEXT })])

    const [json] = await waitForScripts(1)
    expect(parseNode(json).name).toBe(UNSAFE_JSON_LD_TEXT)
    expect(document.querySelector('[data-json-ld-injected]')).toBeNull()
  })
})
