import { getRequestEvent, renderToStream } from '@solidjs/web'
import manifest from 'virtual:solid-manifest'

import App from './App.tsx'
import Document from './Document.tsx'

export function render() {
  const event = getRequestEvent()
  const nonce = event?.nonce ?? undefined
  let hasCompleted = false
  const stream = renderToStream(
    () => (
      <Document>
        <App />
      </Document>
    ),
    {
      manifest,
      nonce,
      signal: event?.request.signal,
      onCompleteAll() {
        hasCompleted = true
      }
    }
  )
  if (event) {
    event.locals.ssrRenderState = {
      get hasErrors() {
        return stream.hasErrors
      },
      get hasCompleted() {
        return hasCompleted
      }
    }
  }
  return stream
}
