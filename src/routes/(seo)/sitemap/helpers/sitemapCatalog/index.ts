import { locales } from '@paraglide/runtime.js'

import type { SitemapEntry } from '@/@types/sitemap.ts'

import { SITEMAP_URL_LIMIT } from '../../constants.ts'
import type {
  SitemapArtifactContext,
  SitemapManifest,
  SitemapRouteContext
} from '../../types.ts'
import { buildSitemap } from '../buildSitemap/index.ts'
import {
  normalizeSitemapEntries,
  sitemapUrl
} from '../normalizeSitemapEntries/index.ts'
import type { PageCatalog, PagePartsOptions } from '../sitemapService/types.ts'
import { validateLocations } from '../validateLocations/index.ts'

type CatalogBudget = { siteUrl: string; byteBudget: number }
type DirectOptions = SitemapRouteContext & CatalogBudget
type ArtifactOptions = SitemapArtifactContext &
  CatalogBudget & { hasPartitionSources: boolean }
type IdentityOptions = { manifest: SitemapManifest; siteUrl: string }

const encoder = new TextEncoder()
const staticPlans = new WeakMap<
  SitemapManifest,
  Map<string, SitemapEntry[][]>
>()
const staticIdentities = new WeakMap<
  SitemapManifest,
  Map<string, Set<string>>
>()

function pageParts({
  entries,
  siteUrl,
  byteBudget
}: PagePartsOptions): SitemapEntry[][] {
  const parts: SitemapEntry[][] = []
  let current: SitemapEntry[] = []
  const frameBytes = encoder.encode(
    buildSitemap({ entries: [], siteUrl })
  ).byteLength
  let currentBytes = frameBytes
  for (const entry of entries) {
    validateLocations({ entries: [entry], siteUrl })
    const groupBytes =
      encoder.encode(buildSitemap({ entries: [entry], siteUrl })).byteLength -
      frameBytes
    const shouldSplitByUrls =
      (current.length + 1) * locales.length > SITEMAP_URL_LIMIT
    if (
      (current.length === 0 && shouldSplitByUrls) ||
      frameBytes + groupBytes > byteBudget
    ) {
      throw new Error('Locale group exceeds the limit')
    }
    if (shouldSplitByUrls || currentBytes + groupBytes > byteBudget) {
      parts.push(current)
      current = []
      currentBytes = frameBytes
    }
    current.push(entry)
    currentBytes += groupBytes
  }
  if (current.length > 0) parts.push(current)
  return parts
}

function cachedPageParts({
  manifest,
  siteUrl,
  byteBudget
}: DirectOptions): SitemapEntry[][] {
  let byBudget = staticPlans.get(manifest)
  if (!byBudget) {
    byBudget = new Map()
    staticPlans.set(manifest, byBudget)
  }
  const key = `${siteUrl}|${byteBudget}`
  let parts = byBudget.get(key)
  if (!parts) {
    parts = pageParts({
      entries: normalizeSitemapEntries({ entries: manifest.entries, siteUrl }),
      siteUrl,
      byteBudget
    })
    byBudget.set(key, parts)
  }
  return parts
}

function cachedIdentities({ manifest, siteUrl }: IdentityOptions): Set<string> {
  let bySite = staticIdentities.get(manifest)
  if (!bySite) {
    bySite = new Map()
    staticIdentities.set(manifest, bySite)
  }
  let urls = bySite.get(siteUrl)
  if (!urls) {
    urls = new Set(
      manifest.entries.map(entry => sitemapUrl({ path: entry.path, siteUrl }))
    )
    bySite.set(siteUrl, urls)
  }
  return urls
}

export function createDirectCatalog(options: DirectOptions): PageCatalog {
  const { manifest, matchRoute } = options
  return {
    readSummary: () =>
      Promise.resolve({
        partCount: cachedPageParts(options).length,
        isFileRoot: false
      }),
    readHasArraySources: () => Promise.resolve(manifest.sources.length > 0),
    readPart: index => Promise.resolve(cachedPageParts(options)[index - 1]),
    readSinglePart: () => Promise.resolve(cachedPageParts(options)[0] ?? []),
    readIdentities: () => Promise.resolve(cachedIdentities(options)),
    readRoutes: () => ({ manifest, matchRoute })
  }
}

// Não há reconstrução aqui: sem o manifesto válido da geração, o pedido falha.
export function createArtifactCatalog({
  artifacts,
  readRoutes,
  siteUrl,
  byteBudget,
  hasPartitionSources
}: ArtifactOptions): PageCatalog {
  const readManifest = async () => {
    const manifest = await artifacts.readManifest()
    if (manifest.siteUrl !== siteUrl || manifest.byteBudget !== byteBudget) {
      throw new Error('Manifest from another generation')
    }
    return manifest
  }
  return {
    readSummary: async () => {
      const manifest = await readManifest()
      if (manifest.hasPartitionSources !== hasPartitionSources) {
        throw new Error('Manifest from another source registry')
      }
      return {
        partCount: manifest.pagePartCount,
        isFileRoot: manifest.isRootStatic
      }
    },
    readHasArraySources: async () => {
      const { hasArraySources } = await readManifest()
      return hasArraySources
    },
    readPart: async index => {
      const { pagePartCount } = await readManifest()
      if (index <= pagePartCount) {
        throw new Error('Static part outside the file layer')
      }
    },
    readSinglePart: async () => {
      const { entries } = await artifacts.readIdentities()
      return entries
    },
    readIdentities: async () => {
      const { urls } = await artifacts.readIdentities()
      return urls
    },
    readRoutes
  }
}
