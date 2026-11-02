import type { SitemapEntry, SitemapPartitionSource } from '@/@types/sitemap.ts'
import type { PublicationContext } from '@/infra/server/publication/types.ts'

import type { SitemapContext, SitemapRouteContext } from '../../types.ts'

type ServiceSettings = {
  sources: readonly SitemapPartitionSource[]
  siteUrl: string
  signal: AbortSignal
  byteBudget?: number
  method?: string
}

type PageSummary = { partCount: number; isFileRoot: boolean }

export type ServiceOptions = ServiceSettings & SitemapContext

export type PartOptions = ServiceOptions & {
  kind: 'pages' | 'source' | 'array'
  part: string
  source?: string
}

export type InventoryOptions = Omit<ServiceSettings, 'signal' | 'method'> &
  SitemapContext

export type PagePartsOptions = {
  entries: readonly SitemapEntry[]
  siteUrl: string
  byteBudget: number
}

// Fronteira entre a geração direta (desenvolvimento e prerender) e o manifesto
// pronto de produção. A identidade exata fica atrás de `readIdentities` para só
// existir em memória quando há fonte em array.
export type PageCatalog = {
  readSummary: () => Promise<PageSummary>
  readHasArraySources: () => Promise<boolean>
  readPart: (index: number) => Promise<readonly SitemapEntry[] | undefined>
  readSinglePart: () => Promise<readonly SitemapEntry[]>
  readIdentities: () => Promise<ReadonlySet<string>>
  readRoutes: () => SitemapRouteContext
}

export type ReadOptions = {
  options: ServiceOptions
  catalog: PageCatalog
  byteBudget: number
  context: PublicationContext
}
