import { query, useSearchParams, type RouteDefinition } from '@solidjs/router'
import { createMemo, createSignal, Loading } from 'solid-js'

import { readBackend } from '../../backend-error/readBackend/index.ts'

const getBackend = query(readBackend, 'backend-error-fixture')

export const route = {
  info: {
    seo: {
      title: 'Backend data',
      description: 'Test page for the backend response states.'
    },
    llms: { optional: true }
  }
} satisfies RouteDefinition

export default function BackendError() {
  const [params] = useSearchParams()
  const [isRequested, setIsRequested] = createSignal(params.phase !== 'action')
  const data = createMemo(() =>
    isRequested() ? getBackend(String(params.id)) : { message: 'Ready to read' }
  )

  const content = () => (
    <main>
      <h1>Backend data</h1>
      <p>{data().message}</p>
      <button type="button" onClick={() => setIsRequested(true)}>
        Query backend
      </button>
    </main>
  )

  return (
    <>
      {params.phase === 'stream' ? (
        <Loading fallback={<p>Loading data...</p>}>{content()}</Loading>
      ) : (
        content()
      )}
    </>
  )
}
