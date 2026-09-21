import type { Product } from 'schema-dts'
import { createSignal, Show } from 'solid-js'
import * as v from 'valibot'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { StructuredData } from '../index.tsx'

const INSTANCES = 2
const NodeSchema = v.record(v.string(), v.unknown())

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
    renderComponent(
      () => <StructuredData data={{ '@type': 'FAQPage', name: 'Dúvidas' }} />,
      { providers: false }
    )

    const [json] = await waitForScripts(1)
    expect(parseNode(json)).toStrictEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      name: 'Dúvidas'
    })
  })

  it('publica uma lista de nós como @graph', async () => {
    renderComponent(
      () => (
        <StructuredData
          data={[
            { '@type': 'Organization', name: 'Acme' },
            { '@type': 'Person', name: 'Ana' }
          ]}
        />
      ),
      { providers: false }
    )

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
    renderComponent(
      () => (
        <>
          <StructuredData data={{ '@type': 'Product', name: 'Primeiro' }} />
          <StructuredData data={{ '@type': 'Product', name: 'Segundo' }} />
        </>
      ),
      { providers: false }
    )

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
    renderComponent(
      () => (
        <Show when={mounted()}>
          <StructuredData data={data()} />
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

  it('escapa HTML para não encerrar o script', async () => {
    renderComponent(
      () => (
        <StructuredData data={{ '@type': 'Thing', name: '</script><b>&' }} />
      ),
      { providers: false }
    )

    const [json] = await waitForScripts(1)
    expect(json).not.toMatch(/[<>&]/u)
    expect(parseNode(json).name).toBe('</script><b>&')
  })
})
