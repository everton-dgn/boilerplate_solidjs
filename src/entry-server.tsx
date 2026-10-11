import { getRequestEvent, renderToStream } from '@solidjs/web'
import manifest from 'virtual:solid-manifest'

import App from './App.tsx'
import Document from './Document.tsx'

// A entrada gerada pelo plugin omite o nonce exigido pela CSP.
export function render() {
  const nonce = getRequestEvent()?.locals.nonce
  return renderToStream(
    () => (
      <Document>
        <App />
      </Document>
    ),
    { manifest, nonce }
  )
}
