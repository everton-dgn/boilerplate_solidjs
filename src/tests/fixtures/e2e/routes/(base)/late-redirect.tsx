import { query, useSearchParams, type RouteDefinition } from '@solidjs/router'
import { createMemo, Loading } from 'solid-js'

import { throwLateRedirect } from '../../late-redirect/throwLateRedirect/index.ts'

type RedirectedProps = { id: string }

const getLateRedirect = query(throwLateRedirect, 'late-redirect')

function Redirected(props: RedirectedProps) {
  const data = createMemo(() => getLateRedirect(props.id))
  return <>{data()}</>
}

export const route = {
  info: {
    seo: { title: 'Redirect depois do shell', noindex: true },
    llms: { optional: true }
  }
} satisfies RouteDefinition

export default function LateRedirect() {
  const [params] = useSearchParams()
  return (
    <main>
      <h1>Redirect depois do shell</h1>
      <Loading fallback={<p>Carregando...</p>}>
        <Redirected id={String(params.id)} />
      </Loading>
    </main>
  )
}
