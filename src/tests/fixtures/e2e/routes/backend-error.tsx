import { query, useSearchParams, type RouteDefinition } from '@solidjs/router'
import { createMemo, createSignal, Loading } from 'solid-js'

import { readBackend } from '../backend-error/readBackend/index.ts'

const getBackend = query(readBackend, 'backend-error-fixture')

export const route = {
  info: {
    seo: {
      title: 'Dados do backend',
      description: 'Página de testes para os estados de resposta do backend.'
    },
    llms: { optional: true }
  }
} satisfies RouteDefinition

export default function BackendError() {
  const [params] = useSearchParams()
  const [requested, setRequested] = createSignal(params.phase !== 'action')
  const data = createMemo(() =>
    requested()
      ? getBackend(String(params.id))
      : { message: 'Pronto para consultar' }
  )

  const content = () => (
    <main>
      <h1>Dados do backend</h1>
      <p>{data().message}</p>
      <button type="button" onClick={() => setRequested(true)}>
        Consultar backend
      </button>
    </main>
  )

  return (
    <>
      {params.phase === 'stream' ? (
        <Loading fallback={<p>Carregando dados...</p>}>{content()}</Loading>
      ) : (
        content()
      )}
    </>
  )
}
