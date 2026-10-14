import { extractLocaleFromUrl, getLocale } from '@paraglide/runtime.js'

/** Instale antes de montar o Router: os ouvintes no alvo Window executam na ordem de registro. */
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
