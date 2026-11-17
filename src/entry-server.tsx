import { getRequestEvent, renderToStream } from '@solidjs/web'
import manifest from 'virtual:solid-manifest'

import { createRenderIntegrity } from '@/infra/server/renderIntegrity/index.ts'

import App from './App.tsx'
import Document from './Document.tsx'

export function render() {
  const event = getRequestEvent()
  const nonce = event?.nonce ?? undefined
  // The global configureServerErrors hook sets hasErrors during the render, so
  // the state must exist before the first pass.
  const integrity = createRenderIntegrity()
  if (event) event.locals.ssrRenderState = integrity.state
  return renderToStream(
    () => (
      <Document>
        <App />
      </Document>
    ),
    {
      manifest,
      nonce,
      signal: event?.request.signal,
      onCompleteAll: integrity.complete
    }
  )
}
