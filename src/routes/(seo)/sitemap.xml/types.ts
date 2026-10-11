import type { SitemapEntry, SitemapRouteInfo } from '@/@types/sitemap.ts'

export type SitemapManifest = {
  entries: readonly SitemapEntry[]
  sources: readonly SitemapRouteInfo[]
}
