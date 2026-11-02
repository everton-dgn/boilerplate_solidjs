import type { SitemapEntry, SitemapRouteInfo } from '@/@types/sitemap.ts'

type SitemapDynamicRoute = { path: string; isIndexable: boolean }

type SitemapIdentityFile = { file: string; bytes: number; sha256: string }

export type SitemapArtifactManifest = {
  version: number
  buildId: string
  generation: string
  siteUrl: string
  byteBudget: number
  pagePartCount: number
  partBytes: readonly number[]
  isRootStatic: boolean
  hasLegacySources: boolean
  hasPartitionSources: boolean
  identities: SitemapIdentityFile | null
}

export type SitemapManifest = {
  entries: readonly SitemapEntry[]
  sources: readonly SitemapRouteInfo[]
  dynamicRoutes?: readonly SitemapDynamicRoute[]
  sourceRoutes?: readonly string[]
}

export type SitemapIdentities = {
  urls: ReadonlySet<string>
  entries: readonly SitemapEntry[]
}

export type SitemapArtifacts = {
  readManifest: () => Promise<SitemapArtifactManifest>
  readIdentities: () => Promise<SitemapIdentities>
}

export type SitemapRouteContext = {
  manifest: SitemapManifest
  matchRoute?: (path: string) => string | undefined
}

export type SitemapArtifactContext = {
  artifacts: SitemapArtifacts
  readRoutes: () => SitemapRouteContext
}

export type SitemapContext = SitemapRouteContext | SitemapArtifactContext
