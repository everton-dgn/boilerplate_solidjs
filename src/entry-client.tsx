import { hydrate } from '@solidjs/web'

import App from './App.tsx'
import Document from './Document.tsx'
import { configureLocaleClient } from './entry-client/configureLocaleClient/index.ts'

const disposeLocaleClient = configureLocaleClient()
if (import.meta.hot) import.meta.hot.dispose(disposeLocaleClient)

// Hidrata a mesma árvore que src/entry-server.tsx renderiza.
hydrate(
  () => (
    <Document>
      <App />
    </Document>
  ),
  document
)
