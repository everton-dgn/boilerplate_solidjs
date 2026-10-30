import { useSearchParams, type RouteDefinition } from '@solidjs/router'
import { createMemo, createSignal, Loading } from 'solid-js'

import { createSeo } from '@/primitives/createSeo/index.ts'
import { UNSAFE_JSON_LD_TEXT } from '@/tests/fixtures/structured-data.ts'

import { waitFixtureGate } from '../../backend/waitFixtureGate/index.ts'

type ProductDetailsProps = { id: string }

// O gate, liberado pelo teste depois do shell, publica o JSON-LD do produto
// como atualização tardia do head.
function ProductDetails(props: ProductDetailsProps) {
  const name = createMemo(async () => {
    await waitFixtureGate({ id: props.id, real: false })
    return 'Produto em streaming'
  })
  createSeo({
    structuredData: () => ({
      '@type': 'Product',
      name: name(),
      description: UNSAFE_JSON_LD_TEXT
    })
  })
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
  const [params] = useSearchParams()
  return (
    <main>
      <h1>Dados estruturados em streaming</h1>
      <Loading fallback={<p>Carregando produto...</p>}>
        <ProductDetails id={String(params.id)} />
      </Loading>
    </main>
  )
}
