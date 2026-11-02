import { locales } from '@paraglide/runtime.js'
import * as v from 'valibot'

import type { SitemapEntry, SitemapPartitionSource } from '@/@types/sitemap.ts'
import { SITEMAP_URL_LIMIT } from '@/routes/(seo)/sitemap/constants.ts'

import { buildSitemap } from '../../../buildSitemap/index.ts'
import {
  normalizeSitemapEntries,
  sitemapUrl
} from '../../../normalizeSitemapEntries/index.ts'
import { validateLocations } from '../../../sitemapCatalog/index.ts'
import type { ReadOptions } from '../../types.ts'

const EntrySchema = v.object({
  path: v.string(),
  lastmod: v.optional(v.string())
})

type PartitionReadOptions = ReadOptions & {
  source: SitemapPartitionSource
  part: string
}

const EntriesSchema = v.array(EntrySchema)
const ENTRY_LIMIT = Math.floor(SITEMAP_URL_LIMIT / locales.length)

async function readLegacySources({
  options,
  catalog,
  context
}: ReadOptions): Promise<SitemapEntry[]> {
  const { siteUrl } = options
  const { manifest, matchRoute } = catalog.readRoutes()
  const identities = await catalog.readIdentities()
  const collected: SitemapEntry[][] = []
  let count = 0
  for (const [index, source] of manifest.sources.entries()) {
    context.signal.throwIfAborted()
    const result = await context.readSource({ key: source, run: source })
    if (!Array.isArray(result) || count + result.length > ENTRY_LIMIT) {
      throw new Error('Fonte legada excede limite')
    }
    count += result.length
    const routePath = manifest.sourceRoutes?.[index]
    // A prioridade estática do contrato legado descarta duplicatas antes
    // da propriedade da fonte, sem publicar seus metadados nessa URL.
    const entries = normalizeSitemapEntries({
      entries: v.parse(EntriesSchema, result),
      siteUrl
    }).filter(
      entry => !identities.has(sitemapUrl({ path: entry.path, siteUrl }))
    )
    if (
      routePath &&
      entries.some(entry => matchRoute?.(entry.path) !== routePath)
    ) {
      throw new Error('Fonte legada publicou outra rota')
    }
    collected.push(entries)
  }
  return collected.flat()
}

function normalizeUnique(
  entries: readonly SitemapEntry[],
  siteUrl: string
): SitemapEntry[] {
  const seen = new Set<string>()
  for (const item of entries) {
    const [normalized] = normalizeSitemapEntries({ entries: [item], siteUrl })
    if (!normalized) throw new Error('Entrada inválida')
    const key = sitemapUrl({ path: normalized.path, siteUrl })
    if (seen.has(key)) throw new Error('Entrada duplicada')
    seen.add(key)
  }
  return normalizeSitemapEntries({ entries, siteUrl })
}

export async function readLegacyPart(
  read: ReadOptions
): Promise<SitemapEntry[] | undefined> {
  const { options, catalog, byteBudget } = read
  const { siteUrl } = options
  if (catalog.readRoutes().manifest.sources.length === 0) return undefined
  const entries = normalizeSitemapEntries({
    entries: await readLegacySources(read),
    siteUrl
  })
  validateLocations({ entries, siteUrl })
  buildSitemap({ entries, siteUrl, byteBudget })
  return entries.length === 0 ? undefined : entries
}

export async function readPartitionEntries({
  options,
  catalog,
  context,
  source: selected,
  part
}: PartitionReadOptions): Promise<SitemapEntry[]> {
  const { siteUrl } = options
  const raw = await context.readSource({
    key: selected,
    run: signal =>
      selected.readPartition({
        id: part,
        limit: ENTRY_LIMIT + 1,
        signal
      })
  })
  if (!Array.isArray(raw) || raw.length > ENTRY_LIMIT) {
    throw new Error('Partição excede limite')
  }
  const entries = normalizeUnique(v.parse(EntriesSchema, raw), siteUrl)
  if (entries.length === 0) return entries
  const { matchRoute } = catalog.readRoutes()
  for (const entry of entries) {
    if (!matchRoute || matchRoute(entry.path) !== selected.routePath) {
      throw new Error('Entrada fora da fonte')
    }
  }
  return entries
}
