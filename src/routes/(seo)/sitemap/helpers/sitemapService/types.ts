import type { SitemapEntry, SitemapPartitionSource } from '@/@types/sitemap.ts'

import type { SitemapManifest } from '../../types.ts'

export type ServiceOptions = {
  manifest: SitemapManifest
  sources: readonly SitemapPartitionSource[]
  siteUrl: string
  signal: AbortSignal
  byteBudget?: number
  method?: string
  matchRoute?: (path: string) => string | undefined
}

export type PartOptions = ServiceOptions & {
  kind: 'pages' | 'source' | 'legacy'
  part: string
  source?: string
}

export type Plan = {
  pages: SitemapEntry[][]
  legacy: SitemapEntry[]
  indexCount: number
  sources: readonly SitemapPartitionSource[]
  indexXml?: string
}

export type PagePartsOptions = {
  entries: readonly SitemapEntry[]
  siteUrl: string
  byteBudget: number
}

export type CachedPagePartsOptions = {
  manifest: SitemapManifest
  siteUrl: string
  byteBudget: number
}
