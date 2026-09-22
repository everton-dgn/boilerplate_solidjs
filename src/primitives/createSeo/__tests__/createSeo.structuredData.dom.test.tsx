import type { Product } from 'schema-dts'
import { createSignal, Show } from 'solid-js'
import * as v from 'valibot'

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
    { providers: false }
  )
}

function readScripts(): string[] {
  return [
    ...document.head.querySelectorAll('script[type="application/ld+json"]')
  ].map(script => script.textContent)
}

function parseNode(json: string | undefined): Record<string, unknown> {
  return v.parse(NodeSchema, JSON.parse(json ?? 'null'))
}

// O registro do head aplica e remove as tags em microtask após os efeitos.
async function waitForScripts(count: number): Promise<string[]> {
  await vi.waitUntil(() => readScripts().length === count)
  return readScripts()
}

describe('dados estruturados publicados pela página', () => {
  beforeEach(async () => {
    await waitForScripts(0)
  })

  it('envolve um nó com @context e o publica no head', async () => {
    mountData([() => ({ '@type': 'FAQPage', name: 'Dúvidas' })])

    const [json] = await waitForScripts(1)
    expect(parseNode(json)).toStrictEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      name: 'Dúvidas'
    })
  })

  it('publica uma lista de nós como @graph', async () => {
    // `as const` prova que uma lista `readonly` é aceita.
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

  it('mantém um script por instância', async () => {
    mountData([
      () => ({ '@type': 'Product', name: 'Primeiro' }),
      () => ({ '@type': 'Product', name: 'Segundo' })
    ])

    const scripts = await waitForScripts(INSTANCES)
    expect(scripts.map(json => parseNode(json).name)).toStrictEqual([
      'Primeiro',
      'Segundo'
    ])
  })

  it('atualiza o script quando os dados mudam e o remove ao desmontar', async () => {
    const [data, setData] = createSignal<Product>({
      '@type': 'Product',
      name: 'Antes'
    })
    const [mounted, setMounted] = createSignal(true)

    function ProductData() {
      createSeo({ structuredData: data })
      return null
    }

    renderComponent(
      () => (
        <Show when={mounted()}>
          <ProductData />
        </Show>
      ),
      { providers: false }
    )
    await waitForScripts(1)

    setData({ '@type': 'Product', name: 'Depois' })
    await vi.waitUntil(() => readScripts()[0]?.includes('Depois'))
    expect(readScripts()).toHaveLength(1)

    setMounted(false)
    await waitForScripts(0)
    expect(readScripts()).toHaveLength(0)
  })

  it('publica, remove e republica os dados sem afetar outra instância', async () => {
    const [data, setData] = createSignal<Product>()

    function ProductData() {
      createSeo({
        structuredData: () => ({ '@type': 'Product', name: 'Fixo' })
      })
      createSeo({ structuredData: data })
      return null
    }

    renderComponent(ProductData, { providers: false })
    const [fixed] = await waitForScripts(1)
    expect(parseNode(fixed).name).toBe('Fixo')

    setData({ '@type': 'Product', name: 'Condicional' })
    const published = await waitForScripts(INSTANCES)
    expect(published.map(json => parseNode(json).name)).toContain('Condicional')

    setData(undefined)
    await expect(waitForScripts(1)).resolves.toStrictEqual([fixed])

    setData({ '@type': 'Product', name: 'Retomado' })
    const resumed = await waitForScripts(INSTANCES)
    expect(resumed.map(json => parseNode(json).name)).toStrictEqual(
      expect.arrayContaining(['Fixo', 'Retomado'])
    )
  })

  it('escapa HTML para não encerrar o script', async () => {
    mountData([() => ({ '@type': 'Thing', name: '</script><b>&' })])

    const [json] = await waitForScripts(1)
    expect(json).not.toMatch(/[<>&]/u)
    expect(parseNode(json).name).toBe('</script><b>&')
  })
})
