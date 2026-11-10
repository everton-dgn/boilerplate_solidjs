import { locales } from '@paraglide/runtime.js'
import * as v from 'valibot'

import type { SitemapEntry, SitemapPartitionSource } from '@/@types/sitemap.ts'
import { SITEMAP_URL_LIMIT } from '@/routes/(seo)/sitemap/constants.ts'

import {
  normalizeSitemapEntries,
  sitemapUrl
} from '../../../normalizeSitemapEntries/index.ts'
import { sitemapEntrySchema } from '../../../sitemapEntrySchema/index.ts'
import type { ReadOptions } from '../../types.ts'

type PartitionReadOptions = ReadOptions & {
  source: SitemapPartitionSource
  part: string
}

const EntriesSchema = v.array(sitemapEntrySchema)
const ENTRY_LIMIT = Math.floor(SITEMAP_URL_LIMIT / locales.length)

async function readArraySources({
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
      throw new Error('Fonte em array excede limite')
    }
    count += result.length
    const routePath = manifest.sourceRoutes?.[index]
    // A prioridade estática do contrato em array descarta duplicatas antes
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
      throw new Error('Fonte em array publicou outra rota')
    }
    collected.push(entries)
  }
  return collected.flat()
}

export async function readArrayPart(
  read: ReadOptions
): Promise<SitemapEntry[] | undefined> {
  const { options, catalog } = read
  const { siteUrl } = options
  if (catalog.readRoutes().manifest.sources.length === 0) return undefined
  const entries = normalizeSitemapEntries({
    entries: await readArraySources(read),
    siteUrl
  })
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
  const parsed = v.parse(EntriesSchema, raw)
  // A normalização descarta URLs repetidas; numa partição, repetir é erro.
  const entries = normalizeSitemapEntries({ entries: parsed, siteUrl })
  if (entries.length !== parsed.length) throw new Error('Entrada duplicada')
  if (entries.length === 0) return entries
  const { matchRoute } = catalog.readRoutes()
  for (const entry of entries) {
    if (!matchRoute || matchRoute(entry.path) !== selected.routePath) {
      throw new Error('Entrada fora da fonte')
    }
  }
  return entries
}
