import type { RouteInfo } from '@solidjs/router'

import { delocalizePathname } from '@/i18n/urls/index.ts'

export function isMarkdownRoute(
  info: readonly (RouteInfo | undefined)[]
): boolean {
  const markdown = info.at(-1)?.markdown
  let isNoindex = false
  for (const route of info) isNoindex = route?.seo?.noindex ?? isNoindex
  return (markdown === true || markdown === 'dynamic') && !isNoindex
}

export function markdownPath(pathname: string): string {
  const path = pathname.replace(/\/$/u, '')
  const isIndex =
    !delocalizePathname(pathname).replace(/\/$/u, '') || path.endsWith('/index')
  return `${path}${isIndex ? '/index' : ''}.md`
}
