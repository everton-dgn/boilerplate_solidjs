import { getRequestEvent, renderToStream } from '@solidjs/web'
import manifest from 'virtual:solid-manifest'

import App from './App.tsx'
import Document from './Document.tsx'

export function render() {
  const nonce = getRequestEvent()?.nonce ?? undefined
  return renderToStream(
    () => (
      <Document>
        <App />
      </Document>
    ),
    { manifest, nonce }
  )
}
