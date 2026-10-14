import { useSearchParams, type RouteDefinition } from '@solidjs/router'
import { createMemo, createSignal, Errored, Loading } from 'solid-js'

import { waitFixtureGate } from '../../outside-error/waitFixtureGate/index.ts'

type PanelProps = { id: string; label: string; shouldReject: boolean }

function StreamPanel(props: PanelProps) {
  const [count, setCount] = createSignal(0)
  const label = createMemo(async () => {
    const { id, shouldReject, label: text } = props
    await waitFixtureGate({ id, real: false })
    if (shouldReject) throw new Error('Hydration fixture failed')
    return text
  })
  return (
    <section>
      <h2>{label()}</h2>
      <button onClick={() => setCount(value => value + 1)}>
        {props.label} count: {count()}
      </button>
    </section>
  )
}

export const route = {
  info: { seo: { title: 'Hydration lifecycle', noindex: true } }
} satisfies RouteDefinition

export default function HydrationPage() {
  const [params] = useSearchParams()
  const [count, setCount] = createSignal(0)
  return (
    <main>
      <h1>Hydration lifecycle</h1>
      <button onClick={() => setCount(value => value + 1)}>
        Shell count: {count()}
      </button>
      <Errored fallback={<p>First stream failed</p>}>
        <Loading fallback={<p>Waiting for First</p>}>
          <StreamPanel
            id={`${String(params.id)}-first`}
            label="First"
            shouldReject={params.mode === 'reject'}
          />
        </Loading>
      </Errored>
      <Errored fallback={<p>Second stream failed</p>}>
        <Loading fallback={<p>Waiting for Second</p>}>
          <StreamPanel
            id={`${String(params.id)}-second`}
            label="Second"
            shouldReject={false}
          />
        </Loading>
      </Errored>
    </main>
  )
}
