import type { Locale } from '@paraglide/runtime.js'

import type { SitePage } from './site-page.ts'

type MarkdownPageContext = MarkdownBuildContext & { path: string }

export type MarkdownRouteInfo = {
  source: `@/${string}/markdown.ts`
}

export type MarkdownBuildContext = {
  locale: Locale
  signal: AbortSignal
}

export type MarkdownSource = {
  getPaths?: (
    context: MarkdownBuildContext
  ) => readonly string[] | Promise<readonly string[]>
  render: (context: MarkdownPageContext) => SitePage | Promise<SitePage>
}
