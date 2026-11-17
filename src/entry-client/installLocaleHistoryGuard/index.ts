import { extractLocaleFromUrl, getLocale } from '@paraglide/runtime.js'

/** Install before mounting the Router: the listeners on the Window target run in registration order. */
export function installLocaleHistoryGuard(
  reload: () => void = () => globalThis.location.reload()
): () => void {
  const documentLocale = getLocale()
  function onPopState(event: PopStateEvent): void {
    const locale = extractLocaleFromUrl(globalThis.location.href)
    if (locale === undefined || locale === documentLocale) return
    event.stopImmediatePropagation()
    reload()
  }
  globalThis.addEventListener('popstate', onPopState)
  return () => globalThis.removeEventListener('popstate', onPopState)
}
