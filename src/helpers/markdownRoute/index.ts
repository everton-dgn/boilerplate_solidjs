import type { RouteInfo } from '@solidjs/router'

import { resolveRouteSeo } from '@/helpers/resolveRouteSeo/index.ts'
import { delocalizePathname } from '@/i18n/urls/index.ts'

export function hasMarkdownOptIn(
  info: readonly (RouteInfo | undefined)[]
): boolean {
  const markdown = info.at(-1)?.markdown
  return markdown === true || markdown === 'dynamic'
}

export function isMarkdownRoute(
  info: readonly (RouteInfo | undefined)[]
): boolean {
  return (
    hasMarkdownOptIn(info) &&
    !resolveRouteSeo(info.map(route => route?.seo)).noindex
  )
}

export function markdownPath(pathname: string): string {
  const path = pathname.replace(/\/$/u, '')
  const isIndex =
    !delocalizePathname(pathname).replace(/\/$/u, '') || path.endsWith('/index')
  return `${path}${isIndex ? '/index' : ''}.md`
}
