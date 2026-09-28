import { query, type RouteDefinition } from '@solidjs/router'
import { createMemo } from 'solid-js'

import { throwRedirect } from '../../control-signal/throwRedirect/index.ts'

const getRedirect = query(throwRedirect, 'control-signal-fixture')

function Redirected() {
  const data = createMemo(() => getRedirect())
  return <>{data()}</>
}

export const route = {
  info: {
    seo: { title: 'Sinal de controle', noindex: true },
    llms: { optional: true }
  }
} satisfies RouteDefinition

export default function ControlSignal() {
  return (
    <main>
      <h1>Sinal de controle</h1>
      <Redirected />
    </main>
  )
}
