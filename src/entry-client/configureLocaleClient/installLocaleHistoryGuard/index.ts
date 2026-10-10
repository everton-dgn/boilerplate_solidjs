import { extractLocaleFromUrl, getLocale } from '@/paraglide/runtime.js'

/** Install before mounting the Router: Window target listeners run in registration order. */
export function installLocaleHistoryGuard(
  reload: () => void = () => globalThis.location.reload()
): () => void {
  const documentLocale = getLocale()
  function onPopState(event: PopStateEvent): void {
    const locale = extractLocaleFromUrl(globalThis.location.href)
    if (locale === undefined || locale === documentLocale) return
    // Keep the entry already selected by the browser, including its state/index.
    event.stopImmediatePropagation()
    reload()
  }
  globalThis.addEventListener('popstate', onPopState)
  return () => globalThis.removeEventListener('popstate', onPopState)
}
