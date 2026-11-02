import { locales } from '@paraglide/runtime.js'
import * as v from 'valibot'

import type { SitemapEntry, SitemapPartitionSource } from '@/@types/sitemap.ts'
import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'
import {
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_NOT_FOUND,
  HTTP_SERVICE_UNAVAILABLE
} from '@/constants/http.ts'
import { SITEMAP_ARTIFACT_VERSION } from '@/constants/publication.ts'
import { logServerFailure } from '@/infra/server/logServerFailure/index.ts'
import { runPublication } from '@/infra/server/publication/index.ts'
import type { SourceOptions } from '@/infra/server/publication/types.ts'

import {
  SITEMAP_BYTE_LIMIT,
  SITEMAP_LOC_LIMIT,
  SITEMAP_RESPONSE_BYTE_BUDGET,
  SITEMAP_SOURCES_TIMEOUT_MS,
  SITEMAP_URL_LIMIT
} from '../../constants.ts'
import type { SitemapManifest } from '../../types.ts'
import { buildSitemap, SitemapByteLimitError } from '../buildSitemap/index.ts'
import { createSitemapIndexBuilder } from '../createSitemapIndexBuilder/index.ts'
import {
  normalizeSitemapEntries,
  sitemapUrl
} from '../normalizeSitemapEntries/index.ts'
import {
  createArtifactCatalog,
  createDirectCatalog,
  validateLocations
} from '../sitemapCatalog/index.ts'
import type {
  InventoryOptions,
  PageCatalog,
  PagePartsOptions,
  PartOptions,
  PublishOptions,
  ReadOptions,
  ServiceOptions
} from './types.ts'

type XmlResponseOptions = { xml: string; method: string }
type RenderOptions = {
  entries: readonly SitemapEntry[]
  options: ServiceOptions
  byteBudget: number
}
type PartResponseOptions = {
  options: PartOptions
  catalog: PageCatalog
  byteBudget: number
}
type IndexPlan = {
  partCount: number
  legacy: SitemapEntry[]
  indexCount: number
  indexXml?: string
}
type CatalogOptions = { options: InventoryOptions; byteBudget: number }
type RegistryOptions = {
  catalog: PageCatalog
  sources: readonly SitemapPartitionSource[]
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const EntrySchema = v.object({
  path: v.string(),
  lastmod: v.optional(v.string())
})
const EntriesSchema = v.array(EntrySchema)
const encoder = new TextEncoder()
const registries = new WeakMap<
  SitemapManifest,
  WeakMap<
    readonly SitemapPartitionSource[],
    Map<string, SitemapPartitionSource>
  >
>()
const ENTRY_LIMIT = Math.floor(SITEMAP_URL_LIMIT / locales.length)

function errorResponse(status = HTTP_SERVICE_UNAVAILABLE): Response {
  return new Response(null, {
    status,
    headers: { 'cache-control': 'no-store' }
  })
}

function xmlResponse({ xml, method }: XmlResponseOptions): Response {
  const body = encoder.encode(xml)
  return new Response(method === 'HEAD' ? null : body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': SITE_CACHE_CONTROL,
      'content-length': String(body.byteLength)
    }
  })
}

function validateBudget(byteBudget: number): void {
  if (
    !Number.isSafeInteger(byteBudget) ||
    byteBudget < 1 ||
    byteBudget > SITEMAP_BYTE_LIMIT
  ) {
    throw new Error('Orçamento inválido')
  }
}

function getRegistry(
  manifest: SitemapManifest,
  sources: readonly SitemapPartitionSource[]
): Map<string, SitemapPartitionSource> {
  let bySources = registries.get(manifest)
  if (!bySources) {
    bySources = new WeakMap()
    registries.set(manifest, bySources)
  }
  const cached = bySources.get(sources)
  if (cached) return cached
  const ids = new Map<string, SitemapPartitionSource>()
  const routes = new Set<string>()
  const eligible = new Set(
    manifest.dynamicRoutes
      ?.filter(route => route.isIndexable)
      .map(route => route.path)
  )
  const legacy = new Set(manifest.sourceRoutes)
  for (const source of sources) {
    if (
      !ID.test(source.id) ||
      source.id === 'pages' ||
      source.id === 'legacy' ||
      ids.has(source.id)
    ) {
      throw new Error('ID de fonte inválido')
    }
    ids.set(source.id, source)
    if (routes.has(source.routePath)) {
      throw new Error('Duas fontes na mesma rota')
    }
    if (legacy.has(source.routePath)) {
      throw new Error('Fonte legada e particionada na mesma rota')
    }
    routes.add(source.routePath)
    if (!eligible.has(source.routePath)) {
      throw new Error('Rota da fonte não é elegível')
    }
  }
  bySources.set(sources, ids)
  return ids
}

// Sem fonte registrada não há o que validar, e a produção evita percorrer rotas.
function readRegistry({
  catalog,
  sources
}: RegistryOptions): Map<string, SitemapPartitionSource> {
  if (sources.length === 0) return new Map()
  return getRegistry(catalog.readRoutes().manifest, sources)
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

// A vaga fica presa até `run` assentar. O sinal das fontes continua abortando ao
// fim da leitura, para quem ainda tiver trabalho pendente depois da resposta.
async function publish({
  options,
  byteBudget,
  run
}: PublishOptions): Promise<Response> {
  const { signal, method = 'GET' } = options
  const response = await runPublication({
    kind: 'sitemap',
    signal,
    method,
    timeoutMs: SITEMAP_SOURCES_TIMEOUT_MS,
    maxOutputBytes: byteBudget,
    run: async context => {
      const finished = new AbortController()
      // O scanner de rotas lê este arquivo como TSX, sem genérico em arrow.
      function readSource<T>({ key, run: read }: SourceOptions<T>): Promise<T> {
        return context.readSource({
          key,
          run: sourceSignal =>
            read(AbortSignal.any([sourceSignal, finished.signal]))
        })
      }
      try {
        return await run({ signal: context.signal, readSource })
      } finally {
        finished.abort()
      }
    }
  })
  if (response.status === HTTP_INTERNAL_SERVER_ERROR) {
    return new Response(null, {
      status: HTTP_SERVICE_UNAVAILABLE,
      headers: { 'cache-control': 'no-store' }
    })
  }
  return response
}

async function readLegacySources({
  options,
  catalog,
  context
}: ReadOptions): Promise<SitemapEntry[]> {
  const { siteUrl } = options
  const { manifest, matchRoute } = catalog.readRoutes()
  const identities = await catalog.readIdentities()
  const collected: SitemapEntry[] = []
  let count = 0
  for (const [index, source] of manifest.sources.entries()) {
    context.signal.throwIfAborted()
    const result = await context.readSource({ key: source, run: source })
    if (!Array.isArray(result) || count + result.length > ENTRY_LIMIT) {
      throw new Error('Fonte legada excede limite')
    }
    count += result.length
    const routePath = manifest.sourceRoutes?.[index]
    const entries = normalizeSitemapEntries({
      entries: v.parse(EntriesSchema, result),
      siteUrl
    })
    for (const entry of entries) {
      // A prioridade estática do contrato legado descarta duplicatas antes
      // da propriedade da fonte, sem publicar seus metadados nessa URL.
      if (identities.has(sitemapUrl({ path: entry.path, siteUrl }))) continue
      if (routePath && matchRoute?.(entry.path) !== routePath) {
        throw new Error('Fonte legada publicou outra rota')
      }
      collected.push(entry)
    }
  }
  return collected
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

async function readLegacyPart(
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

async function planIndex(read: ReadOptions): Promise<IndexPlan> {
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
      ids.some(id => typeof id !== 'string' || !ID.test(id))
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

function combinedSitemapXml(options: PagePartsOptions): string | undefined {
  if (options.entries.length * locales.length > SITEMAP_URL_LIMIT) {
    return undefined
  }
  try {
    return buildSitemap(options)
  } catch (error) {
    if (!(error instanceof SitemapByteLimitError)) throw error
    return undefined
  }
}

async function respondIndex(read: ReadOptions): Promise<Response> {
  const { options, catalog, byteBudget } = read
  const { siteUrl, sources, method = 'GET' } = options
  const { partCount, legacy, indexCount, indexXml } = await planIndex(read)
  if (partCount <= 1 && sources.length === 0) {
    const entries = [...(await catalog.readSinglePart()), ...legacy]
    if (entries.length === 0) return errorResponse(HTTP_NOT_FOUND)
    const xml = combinedSitemapXml({ entries, siteUrl, byteBudget })
    if (xml) return xmlResponse({ xml, method })
  }
  if (indexCount === 0) return errorResponse(HTTP_NOT_FOUND)
  if (!indexXml) throw new Error('Índice ausente')
  return xmlResponse({ xml: indexXml, method })
}

function reportFailure(error: unknown): Response {
  logServerFailure({
    source: 'sitemap',
    error,
    shouldPrintOriginal: import.meta.env.DEV
  })
  return errorResponse()
}

function renderPart({ entries, options, byteBudget }: RenderOptions): Response {
  const { siteUrl, method = 'GET' } = options
  if (entries.length * locales.length > SITEMAP_URL_LIMIT) {
    throw new Error('Sitemap excede limite de URLs')
  }
  validateLocations({ entries, siteUrl })
  const xml = buildSitemap({ entries, siteUrl, byteBudget })
  return xmlResponse({ xml, method })
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

async function respondLegacy({
  options,
  catalog,
  byteBudget
}: PartResponseOptions): Promise<Response> {
  if (!(await catalog.readHasLegacy())) return errorResponse(HTTP_NOT_FOUND)
  return publish({
    options,
    byteBudget,
    run: async context => {
      readRegistry({ catalog, sources: options.sources })
      const entries = await readLegacyPart({
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
  const { sources, source: sourceId, part, siteUrl } = options
  if (sources.length === 0) return errorResponse(HTTP_NOT_FOUND)
  // Um ID maior que a URL do índice nunca é publicado; recusar aqui evita
  // ocupar vaga e chegar à fonte.
  if (part.length > SITEMAP_LOC_LIMIT || !ID.test(part)) {
    return errorResponse(HTTP_NOT_FOUND)
  }
  if (!sources.some(source => source.id === sourceId)) {
    return errorResponse(HTTP_NOT_FOUND)
  }
  return publish({
    options,
    byteBudget,
    run: async context => {
      if ('artifacts' in options) await catalog.readSummary()
      const selected = readRegistry({ catalog, sources }).get(sourceId ?? '')
      if (!selected) return errorResponse(HTTP_NOT_FOUND)
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
      if (entries.length === 0) return errorResponse(HTTP_NOT_FOUND)
      const { matchRoute } = catalog.readRoutes()
      for (const entry of entries) {
        if (!matchRoute || matchRoute(entry.path) !== selected.routePath) {
          throw new Error('Entrada fora da fonte')
        }
      }
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
    const hasLegacy = await catalog.readHasLegacy()
    if (partCount === 0 && !hasLegacy && sources.length === 0) {
      return errorResponse(HTTP_NOT_FOUND)
    }
    return await publish({
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
      case 'legacy': {
        return await respondLegacy(request)
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
    const hasLegacySources = await catalog.readHasLegacy()
    const hasPartitionSources = sources.length > 0
    const hasUnion = partCount <= 1 && !hasPartitionSources
    return Response.json({
      version: SITEMAP_ARTIFACT_VERSION,
      buildId: import.meta.env.PUBLICATION_BUILD_ID,
      siteUrl,
      byteBudget,
      pagePartCount: partCount,
      hasLegacySources,
      hasPartitionSources,
      identities: hasLegacySources
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
