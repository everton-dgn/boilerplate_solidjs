import { HTTP_NOT_FOUND } from '@/constants/http.ts'
import { SITEMAP_ARTIFACT_VERSION } from '@/constants/publication.ts'

import {
  SITEMAP_BYTE_LIMIT,
  SITEMAP_LOC_LIMIT,
  SITEMAP_RESPONSE_BYTE_BUDGET
} from '../../constants.ts'
import {
  createArtifactCatalog,
  createDirectCatalog
} from '../sitemapCatalog/index.ts'
import { SOURCE_ID_PATTERN } from './constants.ts'
import { publishSitemap } from './helpers/publishSitemap/index.ts'
import { readRegistry } from './helpers/readRegistry/index.ts'
import {
  errorResponse,
  renderPart,
  reportFailure,
  respondIndex
} from './helpers/sitemapResponse/index.ts'
import {
  readPartitionEntries,
  readArrayPart
} from './helpers/sourceEntries/index.ts'
import type {
  InventoryOptions,
  PageCatalog,
  PartOptions,
  ServiceOptions
} from './types.ts'

type PartResponseOptions = {
  options: PartOptions
  catalog: PageCatalog
  byteBudget: number
}
type CatalogOptions = { options: InventoryOptions; byteBudget: number }

function validateBudget(byteBudget: number): void {
  if (
    !Number.isSafeInteger(byteBudget) ||
    byteBudget < 1 ||
    byteBudget > SITEMAP_BYTE_LIMIT
  ) {
    throw new Error('Orçamento inválido')
  }
}

function createCatalog({ options, byteBudget }: CatalogOptions): PageCatalog {
  const { siteUrl, sources } = options
  return 'artifacts' in options
    ? createArtifactCatalog({
        artifacts: options.artifacts,
        readRoutes: options.readRoutes,
        siteUrl,
        byteBudget,
        hasPartitionSources: sources.length > 0
      })
    : createDirectCatalog({
        manifest: options.manifest,
        matchRoute: options.matchRoute,
        siteUrl,
        byteBudget
      })
}

async function respondPages({
  options,
  catalog,
  byteBudget
}: PartResponseOptions): Promise<Response> {
  const { part, sources } = options
  const index = Number(part)
  if (!Number.isSafeInteger(index) || index < 1 || String(index) !== part) {
    return errorResponse(HTTP_NOT_FOUND)
  }
  const page = await catalog.readPart(index)
  if (!page) return errorResponse(HTTP_NOT_FOUND)
  readRegistry({ catalog, sources })
  return renderPart({ entries: page, options, byteBudget })
}

async function respondArrayPart({
  options,
  catalog,
  byteBudget
}: PartResponseOptions): Promise<Response> {
  if (!(await catalog.readHasArraySources())) {
    return errorResponse(HTTP_NOT_FOUND)
  }
  return publishSitemap({
    options,
    byteBudget,
    run: async context => {
      readRegistry({ catalog, sources: options.sources })
      const entries = await readArrayPart({
        options,
        catalog,
        byteBudget,
        context
      })
      if (!entries) return errorResponse(HTTP_NOT_FOUND)
      return renderPart({ entries, options, byteBudget })
    }
  })
}

async function respondSource({
  options,
  catalog,
  byteBudget
}: PartResponseOptions): Promise<Response> {
  const { sources, source: sourceId, part } = options
  if (sources.length === 0) return errorResponse(HTTP_NOT_FOUND)
  // Um ID maior que a URL do índice nunca é publicado; recusar aqui evita
  // ocupar vaga e chegar à fonte.
  if (part.length > SITEMAP_LOC_LIMIT || !SOURCE_ID_PATTERN.test(part)) {
    return errorResponse(HTTP_NOT_FOUND)
  }
  if (!sources.some(source => source.id === sourceId)) {
    return errorResponse(HTTP_NOT_FOUND)
  }
  return publishSitemap({
    options,
    byteBudget,
    run: async context => {
      if ('artifacts' in options) await catalog.readSummary()
      const selected = readRegistry({ catalog, sources }).get(sourceId ?? '')
      if (!selected) return errorResponse(HTTP_NOT_FOUND)
      const entries = await readPartitionEntries({
        options,
        catalog,
        byteBudget,
        context,
        source: selected,
        part
      })
      if (entries.length === 0) return errorResponse(HTTP_NOT_FOUND)
      return renderPart({ entries, options, byteBudget })
    }
  })
}

export async function buildSitemapIndexResponse(
  options: ServiceOptions
): Promise<Response> {
  try {
    const { sources, byteBudget = SITEMAP_RESPONSE_BYTE_BUDGET } = options
    validateBudget(byteBudget)
    const catalog = createCatalog({ options, byteBudget })
    const { partCount, isFileRoot } = await catalog.readSummary()
    if (isFileRoot) throw new Error('Raiz estática fora da camada de arquivos')
    const hasArraySources = await catalog.readHasArraySources()
    if (partCount === 0 && !hasArraySources && sources.length === 0) {
      return errorResponse(HTTP_NOT_FOUND)
    }
    return await publishSitemap({
      options,
      byteBudget,
      run: context => {
        readRegistry({ catalog, sources })
        return respondIndex({ options, catalog, byteBudget, context })
      }
    })
  } catch (error) {
    return reportFailure(error)
  }
}

export async function buildSitemapPartResponse(
  options: PartOptions
): Promise<Response> {
  try {
    const { byteBudget = SITEMAP_RESPONSE_BYTE_BUDGET, kind } = options
    validateBudget(byteBudget)
    const request = {
      options,
      catalog: createCatalog({ options, byteBudget }),
      byteBudget
    }
    switch (kind) {
      case 'pages': {
        return await respondPages(request)
      }
      case 'array': {
        return await respondArrayPart(request)
      }
      case 'source': {
        return await respondSource(request)
      }
      default: {
        return errorResponse(HTTP_NOT_FOUND)
      }
    }
  } catch (error) {
    return reportFailure(error)
  }
}

// Resposta do prerender: o build grava as partes e monta os artefatos da função
// a partir daqui, sem consultar fontes dinâmicas.
export async function buildSitemapInventoryResponse(
  options: InventoryOptions
): Promise<Response> {
  try {
    const {
      sources,
      siteUrl,
      byteBudget = SITEMAP_RESPONSE_BYTE_BUDGET
    } = options
    validateBudget(byteBudget)
    const catalog = createCatalog({ options, byteBudget })
    readRegistry({ catalog, sources })
    const { partCount } = await catalog.readSummary()
    const hasArraySources = await catalog.readHasArraySources()
    const hasPartitionSources = sources.length > 0
    const hasUnion = partCount <= 1 && !hasPartitionSources
    return Response.json({
      version: SITEMAP_ARTIFACT_VERSION,
      buildId: import.meta.env.PUBLICATION_BUILD_ID,
      siteUrl,
      byteBudget,
      pagePartCount: partCount,
      hasArraySources,
      hasPartitionSources,
      identities: hasArraySources
        ? {
            urls: [...(await catalog.readIdentities())],
            entries: hasUnion ? await catalog.readSinglePart() : []
          }
        : null
    })
  } catch (error) {
    return reportFailure(error)
  }
}
