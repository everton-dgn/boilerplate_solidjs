import { extractLocaleFromUrl } from '@paraglide/runtime.js'
import { hydrate } from '@solidjs/web'
import { onHydrationEnd } from 'solid-js'

import App from './App.tsx'
import Document from './Document.tsx'
import { installLocaleHistoryGuard } from './entry-client/installLocaleHistoryGuard/index.ts'
import { installOutdatedPageDetection } from './entry-client/installOutdatedPageDetection/index.ts'

const [navigation] = performance.getEntriesByType('navigation')
const loadedLocale = navigation
  ? extractLocaleFromUrl(navigation.name)
  : undefined
const locale = extractLocaleFromUrl(location.href)

// The history can change locale while the bundle loads, before the guard.
if (
  loadedLocale !== undefined &&
  locale !== undefined &&
  loadedLocale !== locale
) {
  location.reload()
} else {
  const disposeOutdatedPageDetection = installOutdatedPageDetection()
  const disposeLocaleHistoryGuard = installLocaleHistoryGuard()
  // Vite keeps a single dispose per module.
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      disposeOutdatedPageDetection()
      disposeLocaleHistoryGuard()
    })
  }

  hydrate(() => {
    const tree = (
      <Document>
        <App />
      </Document>
    )
    // The async entry can park hydrate() until the end of the shell.
    onHydrationEnd(() => {
      document.documentElement.dataset.hydrationEnded = ''
    })
    return tree
  }, document)
}
