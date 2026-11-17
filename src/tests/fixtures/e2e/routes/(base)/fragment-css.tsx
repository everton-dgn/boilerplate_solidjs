import { useSearchParams, type RouteDefinition } from '@solidjs/router'
import { createMemo, lazy, Loading, Show } from 'solid-js'

import { waitFixtureGate } from '../../backend/waitFixtureGate/index.ts'

type DelayedPanelProps = { id: string }

const FragmentCssPanel = lazy(
  () => import('../../fragment-css/FragmentCssPanel/index.tsx')
)

// The memo waits for the gate, which the test releases after the shell, and the
// lazy component is only created when it resolves. That way its CSS enters the
// streamed fragment, after the template, and not the <head>. The fixture covers
// releasing the fragment with a strict CSP and with the stylesheet already cached.
function DelayedPanel(props: DelayedPanelProps) {
  const label = createMemo(async () => {
    await waitFixtureGate({ id: props.id, real: false })
    return 'Resolved fragment'
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
      title: 'Streamed fragment CSS',
      description: 'Fixture of a lazy component with CSS inside a Loading.'
    }
  }
} satisfies RouteDefinition

export default function FragmentCssPage() {
  const [params] = useSearchParams()
  return (
    <main>
      <h1>Streamed fragment CSS</h1>
      <Loading fallback={<p>Loading fragment...</p>}>
        <DelayedPanel id={String(params.id)} />
      </Loading>
    </main>
  )
}
