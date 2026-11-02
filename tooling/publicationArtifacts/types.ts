import type { PrerenderRoute } from 'nitro/types'

import type { ArtifactDigest } from '../markdownPrerender/types.ts'

type SitemapInventoryEntry = { path: string; lastmod?: string }

type SitemapIdentityList = {
  urls: string[]
  entries: SitemapInventoryEntry[]
}

export type SitemapInventory = {
  version: number
  buildId: string
  siteUrl: string
  byteBudget: number
  pagePartCount: number
  hasLegacySources: boolean
  hasPartitionSources: boolean
  identities: SitemapIdentityList | null
}

export type PublishedOptions = {
  publicDir: string
  prerenderedRoutes: readonly PrerenderRoute[]
}

export type DigestMap = ReadonlyMap<string, ArtifactDigest>
