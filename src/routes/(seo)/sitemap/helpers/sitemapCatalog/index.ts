import { locales } from '@paraglide/runtime.js'

import type { SitemapEntry } from '@/@types/sitemap.ts'
import { buildLocaleAlternates } from '@/i18n/buildLocaleAlternates/index.ts'

import { SITEMAP_LOC_LIMIT, SITEMAP_URL_LIMIT } from '../../constants.ts'
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

type CatalogBudget = { siteUrl: string; byteBudget: number }
type DirectOptions = SitemapRouteContext & CatalogBudget
type ArtifactOptions = SitemapArtifactContext &
  CatalogBudget & { hasPartitionSources: boolean }
type LocationOptions = { entries: readonly SitemapEntry[]; siteUrl: string }
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

function checkLocations({ entries, siteUrl }: LocationOptions): void {
  for (const { path } of entries) {
    for (const { href } of buildLocaleAlternates({ href: path, siteUrl })) {
      if (href.length > SITEMAP_LOC_LIMIT) throw new Error('loc excede limite')
    }
  }
}

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
    checkLocations({ entries: [entry], siteUrl })
    const groupBytes =
      encoder.encode(buildSitemap({ entries: [entry], siteUrl })).byteLength -
      frameBytes
    if (frameBytes + groupBytes > byteBudget) {
      throw new Error('Grupo de idiomas excede limite')
    }
    if (
      (current.length + 1) * locales.length > SITEMAP_URL_LIMIT ||
      currentBytes + groupBytes > byteBudget
    ) {
      if (current.length === 0) {
        throw new Error('Grupo de idiomas excede limite')
      }
      parts.push(current)
      current = [entry]
      currentBytes = frameBytes + groupBytes
    } else {
      current.push(entry)
      currentBytes += groupBytes
    }
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

export function validateLocations(options: LocationOptions): void {
  checkLocations(options)
}

export function createDirectCatalog(options: DirectOptions): PageCatalog {
  const { manifest, matchRoute } = options
  return {
    readSummary: () =>
      Promise.resolve({
        partCount: cachedPageParts(options).length,
        isFileRoot: false
      }),
    readHasLegacy: () => Promise.resolve(manifest.sources.length > 0),
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
      throw new Error('Manifesto de outra geração')
    }
    return manifest
  }
  return {
    readSummary: async () => {
      const manifest = await readManifest()
      if (manifest.hasPartitionSources !== hasPartitionSources) {
        throw new Error('Manifesto de outro registro de fontes')
      }
      return {
        partCount: manifest.pagePartCount,
        isFileRoot: manifest.isRootStatic
      }
    },
    readHasLegacy: async () => {
      const { hasLegacySources } = await readManifest()
      return hasLegacySources
    },
    readPart: async index => {
      const { pagePartCount } = await readManifest()
      if (index <= pagePartCount) {
        throw new Error('Parte estática fora da camada de arquivos')
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
