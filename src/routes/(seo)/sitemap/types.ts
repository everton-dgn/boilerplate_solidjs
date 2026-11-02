import type { SitemapEntry, SitemapRouteInfo } from '@/@types/sitemap.ts'

type SitemapDynamicRoute = { path: string; isIndexable: boolean }

export type SitemapManifest = {
  entries: readonly SitemapEntry[]
  sources: readonly SitemapRouteInfo[]
  dynamicRoutes?: readonly SitemapDynamicRoute[]
  sourceRoutes?: readonly string[]
}
