import type { RouteDefinition } from '@solidjs/router'

import type { Locale } from '../../paraglide/runtime.js'
import type { LlmsRouteInfo, LlmsSelection } from '../../src/@types/llms.ts'
import type { MarkdownSource } from '../../src/@types/markdown.ts'

export type MarkdownRoute = {
  id: string
  path: string
  markdownSource?: string
  matchFilters?: RouteDefinition['matchFilters']
  info?: {
    markdown?: boolean
    seo?: { noindex?: boolean }
    llms?: LlmsRouteInfo
  }
  children?: MarkdownRoute[]
}

export type MarkdownArtifact = {
  path: string
  href: string
  locale: Locale
  body: string
  title: string
  description: string
  llms: LlmsSelection
}

export type MarkdownModule = { markdown?: MarkdownSource }

export type GenerateArtifactsOptions = {
  routes: MarkdownRoute[]
  reservedPaths?: string[]
  locales: readonly Locale[]
  setLocale: (locale: Locale) => void
  localize: (path: string) => string
  load: (source: string) => Promise<MarkdownModule>
}

export type LoadArtifactsOptions = {
  root: string
  directory: string
  mode?: string
  environment?: Record<string, string | boolean>
}

export type ArtifactBuild = {
  artifacts: MarkdownArtifact[]
  dependencies: string[]
}
