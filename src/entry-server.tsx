import { getRequestEvent, renderToStream } from '@solidjs/web'
import manifest from 'virtual:solid-manifest'

import App from './App.tsx'
import Document from './Document.tsx'

// Entrada autoral no lugar da gerada pelo @solidjs/vite-plugin, que chama o
// renderToStream sem nonce. Com o nonce da requisição, o runtime o grava no
// HydrationScript, nos scripts de dados e de streaming, nos modulepreload e nas
// folhas de estilo.
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
