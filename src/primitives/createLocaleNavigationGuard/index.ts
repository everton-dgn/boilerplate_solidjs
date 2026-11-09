import { extractLocaleFromUrl, getLocale } from '@paraglide/runtime.js'
import { useBeforeLeave } from '@solidjs/router'
import { isServer } from '@solidjs/web'

import {
  navigateDocument,
  readLeaveTarget
} from '@/infra/adapters/documentNavigation/index.ts'

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
    const target = readLeaveTarget(event)
    if (!target || !changesLocale(target)) return
    event.preventDefault()
    navigateDocument({
      href: target.href,
      shouldReplace: event.options?.replace
    })
  })
}
