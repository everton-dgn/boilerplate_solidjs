import { query, type RouteDefinition } from '@solidjs/router'
import { createMemo, Loading } from 'solid-js'

import { throwLateRedirect } from '../../late-redirect/throwLateRedirect/index.ts'

const getLateRedirect = query(throwLateRedirect, 'late-redirect')

function Redirected() {
  const data = createMemo(() => getLateRedirect())
  return <>{data()}</>
}

export const route = {
  info: {
    seo: { title: 'Redirect depois do shell', noindex: true },
    llms: { optional: true }
  }
} satisfies RouteDefinition

export default function LateRedirect() {
  return (
    <main>
      <h1>Redirect depois do shell</h1>
      <Loading fallback={<p>Carregando...</p>}>
        <Redirected />
      </Loading>
    </main>
  )
}
