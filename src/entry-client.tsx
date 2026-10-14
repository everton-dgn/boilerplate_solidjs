import { extractLocaleFromUrl } from '@paraglide/runtime.js'
import { hydrate } from '@solidjs/web'

import App from './App.tsx'
import Document from './Document.tsx'
import { installLocaleHistoryGuard } from './entry-client/installLocaleHistoryGuard/index.ts'

const [navigation] = performance.getEntriesByType('navigation')
const loadedLocale = navigation
  ? extractLocaleFromUrl(navigation.name)
  : undefined
const locale = extractLocaleFromUrl(location.href)

// O histórico pode mudar de idioma enquanto o bundle carrega, antes do guard.
if (
  loadedLocale !== undefined &&
  locale !== undefined &&
  loadedLocale !== locale
) {
  location.reload()
} else {
  const disposeLocaleHistoryGuard = installLocaleHistoryGuard()
  if (import.meta.hot) import.meta.hot.dispose(disposeLocaleHistoryGuard)

  hydrate(
    () => (
      <Document>
        <App />
      </Document>
    ),
    document
  )
}
