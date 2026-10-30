import { useSearchParams, type RouteDefinition } from '@solidjs/router'
import { createMemo, lazy, Loading, Show } from 'solid-js'

import { waitFixtureGate } from '../../backend/waitFixtureGate/index.ts'

type DelayedPanelProps = { id: string }

const FragmentCssPanel = lazy(
  () => import('../../fragment-css/FragmentCssPanel/index.tsx')
)

// A memo espera o gate, que o teste libera depois do shell, e o componente
// lazy só é criado quando ela resolve. Assim a CSS dele entra no fragmento em
// streaming, depois do template, e não no <head>. A fixture cobre a liberação
// do fragmento com CSP estrita e com a folha já em cache.
function DelayedPanel(props: DelayedPanelProps) {
  const label = createMemo(async () => {
    await waitFixtureGate({ id: props.id, real: false })
    return 'Fragmento resolvido'
  })
  return (
    <section>
      <h2>{label()}</h2>
      <Show when={label()}>
        <FragmentCssPanel />
      </Show>
    </section>
  )
}

export const route = {
  info: {
    seo: {
      title: 'CSS de fragmento em streaming',
      description: 'Fixture de componente lazy com CSS dentro de um Loading.'
    }
  }
} satisfies RouteDefinition

export default function FragmentCssPage() {
  const [params] = useSearchParams()
  return (
    <main>
      <h1>CSS de fragmento em streaming</h1>
      <Loading fallback={<p>Carregando fragmento...</p>}>
        <DelayedPanel id={String(params.id)} />
      </Loading>
    </main>
  )
}
