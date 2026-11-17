import { useSearchParams, type RouteDefinition } from '@solidjs/router'
import { createMemo, createSignal, Loading } from 'solid-js'

import { createSeo } from '@/primitives/createSeo/index.ts'
import { UNSAFE_JSON_LD_TEXT } from '@/tests/fixtures/structured-data.ts'

import { waitFixtureGate } from '../../backend/waitFixtureGate/index.ts'

type ProductDetailsProps = { id: string }

// The gate, released by the test after the shell, publishes the JSON-LD of the
// product as a late update of the head.
function ProductDetails(props: ProductDetailsProps) {
  const name = createMemo(async () => {
    await waitFixtureGate({ id: props.id, real: false })
    return 'Streamed product'
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
        Increment
      </button>
      <p>Cliques: {clicks()}</p>
    </section>
  )
}

export const route = {
  info: {
    seo: {
      title: 'Streamed structured data',
      description: 'Fixture of JSON-LD published after the async data.'
    }
  }
} satisfies RouteDefinition

export default function StructuredDataStreamPage() {
  const [params] = useSearchParams()
  return (
    <main>
      <h1>Streamed structured data</h1>
      <Loading fallback={<p>Loading product...</p>}>
        <ProductDetails id={String(params.id)} />
      </Loading>
    </main>
  )
}
