import { query, useSearchParams, type RouteDefinition } from '@solidjs/router'
import { createMemo, Match, Switch } from 'solid-js'

import { returnEnvelope } from '../../control-signal/returnEnvelope/index.ts'
import { throwEnvelope } from '../../control-signal/throwEnvelope/index.ts'
import { throwRedirect } from '../../control-signal/throwRedirect/index.ts'

const getRedirect = query(throwRedirect, 'control-signal-redirect')
const getReturnedEnvelope = query(returnEnvelope, 'control-signal-returned')
const getThrownEnvelope = query(throwEnvelope, 'control-signal-thrown')

type EnvelopeProps = { id: string }

function Redirected() {
  const data = createMemo(() => getRedirect())
  return <>{data()}</>
}

function ReturnedEnvelope() {
  const data = createMemo(() => getReturnedEnvelope())
  return <p>{data().message}</p>
}

function ThrownEnvelope(props: EnvelopeProps) {
  const data = createMemo(() => getThrownEnvelope(props.id))
  return <>{data()}</>
}

export const route = {
  info: {
    seo: { title: 'Sinal de controle', noindex: true },
    llms: { optional: true }
  }
} satisfies RouteDefinition

export default function ControlSignal() {
  const [params] = useSearchParams()
  return (
    <main>
      <h1>Sinal de controle</h1>
      <Switch fallback={<Redirected />}>
        <Match when={params.kind === 'envelope-return'}>
          <ReturnedEnvelope />
        </Match>
        <Match when={params.kind === 'envelope-throw'}>
          <ThrownEnvelope id={String(params.id)} />
        </Match>
      </Switch>
    </main>
  )
}
