import type { SitemapEntry } from '@/@types/sitemap.ts'
import { SITEMAP_URL_LIMIT } from '@/routes/(seo)/sitemap/constants.ts'

import { createSitemapIndexBuilder } from '../../../createSitemapIndexBuilder/index.ts'
import { SOURCE_ID_PATTERN } from '../../constants.ts'
import type { ReadOptions } from '../../types.ts'
import { readLegacyPart } from '../sourceEntries/index.ts'

type IndexPlan = {
  partCount: number
  legacy: SitemapEntry[]
  indexCount: number
  indexXml?: string
}

export async function planIndex(read: ReadOptions): Promise<IndexPlan> {
  const { options, catalog, byteBudget, context } = read
  const { sources, siteUrl } = options
  const { partCount } = await catalog.readSummary()
  const builder = createSitemapIndexBuilder(byteBudget)
  for (let index = 1; index <= partCount; index += 1) {
    builder.add(new URL(`/sitemaps/pages/${index}.xml`, siteUrl).href)
  }
  const legacy = (await readLegacyPart(read)) ?? []
  if (legacy.length > 0) {
    builder.add(new URL('/sitemaps/legacy.xml', siteUrl).href)
  }
  for (const source of sources) {
    context.signal.throwIfAborted()
    const limit = SITEMAP_URL_LIMIT - builder.count()
    const ids = await context.readSource({
      key: source,
      run: signal => source.listPartitions({ limit: limit + 1, signal })
    })
    if (!Array.isArray(ids) || ids.length > limit) {
      throw new Error('Índice acima do limite de URLs')
    }
    if (
      new Set(ids).size !== ids.length ||
      ids.some(id => typeof id !== 'string' || !SOURCE_ID_PATTERN.test(id))
    ) {
      throw new Error('Partições inválidas')
    }
    for (const id of ids) {
      builder.add(new URL(`/sitemaps/${source.id}/${id}.xml`, siteUrl).href)
    }
  }
  const indexCount = builder.count()
  const indexXml = indexCount > 0 ? builder.finish() : undefined
  return { partCount, legacy, indexCount, indexXml }
}
