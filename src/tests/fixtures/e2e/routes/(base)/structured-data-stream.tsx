import type { RouteDefinition } from '@solidjs/router'
import { createMemo, createSignal, Loading } from 'solid-js'

import { createSeo } from '@/primitives/createSeo/index.ts'

const DATA_DELAY_MS = 150

function loadProductName(): Promise<string> {
  // oxlint-disable-next-line promise/avoid-new -- Adapta o timer da fixture para suspender o SSR.
  return new Promise(resolve => {
    setTimeout(() => resolve('Produto em streaming'), DATA_DELAY_MS)
  })
}

function ProductDetails() {
  const name = createMemo(loadProductName)
  createSeo({ structuredData: () => ({ '@type': 'Product', name: name() }) })
  const [clicks, setClicks] = createSignal(0)

  return (
    <section>
      <h2>{name()}</h2>
      <button type="button" onClick={() => setClicks(value => value + 1)}>
        Incrementar
      </button>
      <p>Cliques: {clicks()}</p>
    </section>
  )
}

export const route = {
  info: {
    seo: {
      title: 'Dados estruturados em streaming',
      description: 'Fixture de JSON-LD publicado após os dados assíncronos.'
    }
  }
} satisfies RouteDefinition

export default function StructuredDataStreamPage() {
  return (
    <main>
      <h1>Dados estruturados em streaming</h1>
      <Loading fallback={<p>Carregando produto...</p>}>
        <ProductDetails />
      </Loading>
    </main>
  )
}
