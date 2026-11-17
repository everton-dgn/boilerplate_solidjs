import { useSearchParams, type RouteDefinition } from '@solidjs/router'
import { createMemo, Errored, Loading, Match, Switch } from 'solid-js'

import { fixtureError } from '../../backend/fixtureError/index.ts'
import { waitFixtureGate } from '../../backend/waitFixtureGate/index.ts'
import { readFixtureMarker } from '../../outside-error/readFixtureMarker/index.ts'
import { recordFixtureThrow } from '../../outside-error/recordFixtureThrow/index.ts'

type GateProps = { id: string }
type RejectionProps = { id: string; isInElement?: boolean }

// Reads, records and throws the marker in the body of the component, during the render.
function ImmediateThrower(): never {
  const marker = readFixtureMarker()
  recordFixtureThrow(marker)
  throw fixtureError(marker)
}

function throwFixture(marker: string): never {
  throw fixtureError(marker)
}

// Throws in the render only after the test releases the gate, with the shell
// already sent. The marker stays in the closure: the memo only resolves with
// true, because its value is serialized for the hydration.
function GatedThrower(props: GateProps) {
  const marker = readFixtureMarker()
  const gate = createMemo(async () => {
    await waitFixtureGate({ id: props.id, real: recordFixtureThrow(marker) })
    return true
  })
  return <>{gate() ? throwFixture(marker) : null}</>
}

// Common async source, without "use server": rejects with the marker read in the
// request scope after the gate is released. The read stays as a direct child or
// in an element hole, which the runtime routes in different ways.
function GatedRejection(props: RejectionProps) {
  const data = createMemo(async () => {
    const marker = readFixtureMarker()
    const real = recordFixtureThrow(marker)
    await waitFixtureGate({ id: props.id, real })
    throw fixtureError(marker)
  })
  return <>{props.isInElement ? <p>{data()}</p> : data()}</>
}

export const route = {
  info: {
    seo: { title: 'Errors outside server functions', noindex: true },
    llms: { optional: true }
  }
} satisfies RouteDefinition

export default function OutsideError() {
  const [params] = useSearchParams()
  const id = String(params.id)
  return (
    <main>
      <h1>Errors outside server functions</h1>
      <Switch fallback={<p>Unknown case</p>}>
        <Match when={params.case === 'render-local'}>
          <Errored fallback={<p data-fixture="fallback">Contained failure</p>}>
            <ImmediateThrower />
          </Errored>
        </Match>
        <Match when={params.case === 'render-root'}>
          <ImmediateThrower />
        </Match>
        <Match when={params.case === 'render-stream'}>
          <Loading fallback={<p>Loading fixture...</p>}>
            <GatedThrower id={id} />
          </Loading>
        </Match>
        <Match when={params.case === 'async-ssr'}>
          <GatedRejection id={id} />
        </Match>
        <Match when={params.case === 'async-direct'}>
          <Loading fallback={<p>Loading fixture...</p>}>
            <GatedRejection id={id} />
          </Loading>
        </Match>
        <Match when={params.case === 'async-element'}>
          <Loading fallback={<p>Loading fixture...</p>}>
            <GatedRejection id={id} isInElement />
          </Loading>
        </Match>
      </Switch>
    </main>
  )
}
