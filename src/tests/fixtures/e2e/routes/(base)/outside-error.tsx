import { useSearchParams, type RouteDefinition } from '@solidjs/router'
import { createMemo, Errored, Loading, Match, Switch } from 'solid-js'

import { fixtureError } from '../../outside-error/fixtureError/index.ts'
import { readFixtureMarker } from '../../outside-error/readFixtureMarker/index.ts'
import { recordFixtureThrow } from '../../outside-error/recordFixtureThrow/index.ts'
import { waitFixtureGate } from '../../outside-error/waitFixtureGate/index.ts'

type GateProps = { id: string }
type RejectionProps = { id: string; inElement?: boolean }

// Lê, registra e lança o marcador no corpo do componente, durante o render.
function ImmediateThrower(): never {
  const marker = readFixtureMarker()
  recordFixtureThrow(marker)
  throw fixtureError(marker)
}

function throwFixture(marker: string): never {
  throw fixtureError(marker)
}

// Lança no render só depois que o teste libera o gate, com o shell já
// enviado. O marcador fica no fechamento: a memo resolve só com true, porque
// o valor dela é serializado para a hidratação.
function GatedThrower(props: GateProps) {
  const marker = readFixtureMarker()
  const gate = createMemo(async () => {
    await waitFixtureGate({ id: props.id, real: recordFixtureThrow(marker) })
    return true
  })
  return <>{gate() ? throwFixture(marker) : null}</>
}

// Fonte assíncrona comum, sem "use server": rejeita com o marcador lido no
// escopo da requisição depois que o gate é liberado. A leitura fica como
// filho direto ou num buraco de elemento, que o runtime roteia de formas
// diferentes.
function GatedRejection(props: RejectionProps) {
  const data = createMemo(async () => {
    const marker = readFixtureMarker()
    const real = recordFixtureThrow(marker)
    await waitFixtureGate({ id: props.id, real })
    throw fixtureError(marker)
  })
  return <>{props.inElement ? <p>{data()}</p> : data()}</>
}

export const route = {
  info: {
    seo: { title: 'Erros fora de server functions', noindex: true },
    llms: { optional: true }
  }
} satisfies RouteDefinition

export default function OutsideError() {
  const [params] = useSearchParams()
  const id = String(params.id)
  return (
    <main>
      <h1>Erros fora de server functions</h1>
      <Switch fallback={<p>Caso desconhecido</p>}>
        <Match when={params.case === 'render-local'}>
          <Errored fallback={<p data-fixture="fallback">Falha contida</p>}>
            <ImmediateThrower />
          </Errored>
        </Match>
        <Match when={params.case === 'render-root'}>
          <ImmediateThrower />
        </Match>
        <Match when={params.case === 'render-stream'}>
          <Loading fallback={<p>Carregando fixture...</p>}>
            <GatedThrower id={id} />
          </Loading>
        </Match>
        <Match when={params.case === 'async-ssr'}>
          <GatedRejection id={id} />
        </Match>
        <Match when={params.case === 'async-direct'}>
          <Loading fallback={<p>Carregando fixture...</p>}>
            <GatedRejection id={id} />
          </Loading>
        </Match>
        <Match when={params.case === 'async-element'}>
          <Loading fallback={<p>Carregando fixture...</p>}>
            <GatedRejection id={id} inElement />
          </Loading>
        </Match>
      </Switch>
    </main>
  )
}
