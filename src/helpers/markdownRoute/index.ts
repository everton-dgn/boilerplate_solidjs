import type { RouteInfo } from '@solidjs/router'

import { resolveRouteSeo } from '@/helpers/resolveRouteSeo/index.ts'
import { delocalizePathname } from '@/i18n/urls/index.ts'

const LAST_MATCH = -1

export function isMarkdownRoute(
  info: readonly (RouteInfo | undefined)[]
): boolean {
  return (
    info.at(LAST_MATCH)?.markdown === true &&
    !resolveRouteSeo(info.map(route => route?.seo)).noindex
  )
}

export function markdownPath(pathname: string): string {
  const path = pathname.replace(/\/$/u, '')
  const isIndex =
    !delocalizePathname(pathname).replace(/\/$/u, '') || path.endsWith('/index')
  return `${path}${isIndex ? '/index' : ''}.md`
}
