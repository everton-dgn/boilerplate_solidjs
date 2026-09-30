import { hydrate } from '@solidjs/web'

import App from './App.tsx'
import Document from './Document.tsx'

// Hidrata a mesma árvore que src/entry-server.tsx renderiza.
hydrate(
  () => (
    <Document>
      <App />
    </Document>
  ),
  document
)
