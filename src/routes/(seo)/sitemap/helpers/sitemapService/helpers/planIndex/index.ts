import type { SitemapEntry, SitemapPartitionSource } from '@/@types/sitemap.ts'
import { SITEMAP_URL_LIMIT } from '@/routes/(seo)/sitemap/constants.ts'

import { buildSitemap } from '../../../buildSitemap/index.ts'
import { createSitemapIndexBuilder } from '../../../createSitemapIndexBuilder/index.ts'
import { validateLocations } from '../../../validateLocations/index.ts'
import { SOURCE_ID_PATTERN } from '../../constants.ts'
import type { ReadOptions } from '../../types.ts'
import { readArrayPart } from '../sourceEntries/index.ts'

type IndexPlan = {
  partCount: number
  arrayEntries: SitemapEntry[]
  indexCount: number
  indexXml?: string
}

type SourcePartitionsOptions = {
  builder: ReturnType<typeof createSitemapIndexBuilder>
  source: SitemapPartitionSource
  read: ReadOptions
}

async function addSourcePartitions({
  builder,
  source,
  read
}: SourcePartitionsOptions): Promise<void> {
  const { options, context } = read
  const limit = SITEMAP_URL_LIMIT - builder.count()
  const ids = await context.readSource({
    key: source,
    run: signal => source.listPartitions({ limit: limit + 1, signal })
  })
  if (!Array.isArray(ids) || ids.length > limit) {
    throw new Error('Index above the URL limit')
  }
  if (
    new Set(ids).size !== ids.length ||
    ids.some(id => typeof id !== 'string' || !SOURCE_ID_PATTERN.test(id))
  ) {
    throw new Error('Invalid partitions')
  }
  for (const id of ids) {
    builder.add(
      new URL(`/sitemaps/${source.id}/${id}.xml`, options.siteUrl).href
    )
  }
}

export async function planIndex(read: ReadOptions): Promise<IndexPlan> {
  const { options, catalog, byteBudget, context } = read
  const { sources, siteUrl } = options
  const { partCount } = await catalog.readSummary()
  const builder = createSitemapIndexBuilder(byteBudget)
  for (let index = 1; index <= partCount; index += 1) {
    builder.add(new URL(`/sitemaps/pages/${index}.xml`, siteUrl).href)
  }
  const arrayEntries = (await readArrayPart(read)) ?? []
  if (arrayEntries.length > 0) {
    // O índice só lista a parte em array que cabe no orçamento; a rota
    // array.xml faz a mesma verificação ao montar a resposta.
    validateLocations({ entries: arrayEntries, siteUrl })
    buildSitemap({ entries: arrayEntries, siteUrl, byteBudget })
    builder.add(new URL('/sitemaps/array.xml', siteUrl).href)
  }
  for (const source of sources) {
    context.signal.throwIfAborted()
    await addSourcePartitions({ builder, source, read })
  }
  const indexCount = builder.count()
  const indexXml = indexCount > 0 ? builder.finish() : undefined
  return { partCount, arrayEntries, indexCount, indexXml }
}
