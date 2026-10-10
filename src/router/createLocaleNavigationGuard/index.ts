import { useBeforeLeave } from '@solidjs/router'
import { isServer } from '@solidjs/web'

import { extractLocaleFromUrl, getLocale } from '@/paraglide/runtime.js'

/** Keep the mounted document and request locale together across Router redirects. */
export function createLocaleNavigationGuard(): void {
  if (isServer) return
  const documentLocale = getLocale()

  function changesLocale(target: URL): boolean {
    const locale = extractLocaleFromUrl(target)
    return (
      target.origin === globalThis.location.origin &&
      locale !== undefined &&
      locale !== documentLocale
    )
  }

  useBeforeLeave(event => {
    if (event.defaultPrevented || typeof event.to === 'number') return
    const target = new URL(event.to, globalThis.location.href)
    if (!changesLocale(target)) return
    event.preventDefault()
    if (event.options?.replace) globalThis.location.replace(target.href)
    else globalThis.location.assign(target.href)
  })
}
