import { locales } from '@paraglide/runtime.js'
import * as v from 'valibot'

import type { SitemapEntry, SitemapPartitionSource } from '@/@types/sitemap.ts'
import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'
import { HTTP_NOT_FOUND, HTTP_SERVICE_UNAVAILABLE } from '@/constants/http.ts'
import { buildLocaleAlternates } from '@/i18n/buildLocaleAlternates/index.ts'
import { logServerFailure } from '@/infra/server/logServerFailure/index.ts'

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
import type {
  CachedPagePartsOptions,
  PagePartsOptions,
  PartOptions,
  Plan,
  ServiceOptions
} from './types.ts'

type XmlResponseOptions = { xml: string; method: string }

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const EntrySchema = v.object({
  path: v.string(),
  lastmod: v.optional(v.string())
})
const EntriesSchema = v.array(EntrySchema)
const encoder = new TextEncoder()
const staticPlans = new WeakMap<
  SitemapManifest,
  Map<string, SitemapEntry[][]>
>()
const staticIdentities = new WeakMap<
  SitemapManifest,
  Map<string, Set<string>>
>()
const registries = new WeakMap<
  SitemapManifest,
  WeakMap<
    readonly SitemapPartitionSource[],
    Map<string, SitemapPartitionSource>
  >
>()

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

function validateLocations(
  entries: readonly SitemapEntry[],
  siteUrl: string
): void {
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
    validateLocations([entry], siteUrl)
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
}: CachedPagePartsOptions): SitemapEntry[][] {
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

async function bounded<T>(
  signal: AbortSignal,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), SITEMAP_SOURCES_TIMEOUT_MS)
  const combined = AbortSignal.any([signal, deadline.signal])
  const aborted = Promise.withResolvers<never>()
  const onAbort = () => aborted.reject(new Error('Leitura interrompida'))
  try {
    combined.throwIfAborted()
    combined.addEventListener('abort', onAbort, { once: true })
    const work = Promise.withResolvers<T>()
    const raced = Promise.race([work.promise, aborted.promise])
    queueMicrotask(() => {
      try {
        combined.throwIfAborted()
        work.resolve(run(combined))
      } catch (error) {
        work.reject(error)
      }
    })
    return await raced
  } finally {
    clearTimeout(timer)
    combined.removeEventListener('abort', onAbort)
    deadline.abort()
  }
}

async function readLegacySources(
  options: ServiceOptions
): Promise<SitemapEntry[]> {
  const { manifest, signal, siteUrl, matchRoute } = options
  let bySite = staticIdentities.get(manifest)
  if (!bySite) {
    bySite = new Map()
    staticIdentities.set(manifest, bySite)
  }
  let staticUrls = bySite.get(siteUrl)
  if (!staticUrls) {
    staticUrls = new Set(
      manifest.entries.map(entry => sitemapUrl({ path: entry.path, siteUrl }))
    )
    bySite.set(siteUrl, staticUrls)
  }
  const identities = staticUrls
  let count = 0
  const results = await Promise.all(
    manifest.sources.map(async (source, index) => {
      signal.throwIfAborted()
      const result = v.parse(EntriesSchema, await source(signal))
      count += result.length
      if (count > Math.floor(SITEMAP_URL_LIMIT / locales.length)) {
        throw new Error('Fonte legada excede limite')
      }
      const routePath = manifest.sourceRoutes?.[index]
      return normalizeSitemapEntries({ entries: result, siteUrl }).filter(
        entry => {
          // A prioridade estática do contrato legado descarta duplicatas antes
          // da propriedade da fonte, sem publicar seus metadados nessa URL.
          if (identities.has(sitemapUrl({ path: entry.path, siteUrl }))) {
            return false
          }
          if (routePath && matchRoute?.(entry.path) !== routePath) {
            throw new Error('Fonte legada publicou outra rota')
          }
          return true
        }
      )
    })
  )
  return results.flat()
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
  options: ServiceOptions
): Promise<SitemapEntry[] | undefined> {
  const {
    manifest,
    siteUrl,
    byteBudget = SITEMAP_RESPONSE_BYTE_BUDGET
  } = options
  if (manifest.sources.length === 0) return undefined
  const raw = await readLegacySources(options)
  if (raw.length > Math.floor(SITEMAP_URL_LIMIT / locales.length)) {
    throw new Error('Fonte legada excede limite')
  }
  const entries = normalizeSitemapEntries({
    entries: v.parse(EntriesSchema, raw),
    siteUrl
  })
  validateLocations(entries, siteUrl)
  buildSitemap({ entries, siteUrl, byteBudget })
  return entries.length === 0 ? undefined : entries
}

async function readSourcePart(
  options: PartOptions,
  selected: SitemapPartitionSource
): Promise<SitemapEntry[] | undefined> {
  const { part, signal, siteUrl, matchRoute } = options
  if (!ID.test(part)) return undefined
  const limit = Math.floor(SITEMAP_URL_LIMIT / locales.length)
  const raw = await bounded(signal, sourceSignal =>
    selected.readPartition({ id: part, limit: limit + 1, signal: sourceSignal })
  )
  if (!Array.isArray(raw) || raw.length > limit) {
    throw new Error('Partição excede limite')
  }
  const entries = normalizeUnique(v.parse(EntriesSchema, raw), siteUrl)
  if (entries.length === 0) return undefined
  for (const entry of entries) {
    if (!matchRoute || matchRoute(entry.path) !== selected.routePath) {
      throw new Error('Entrada fora da fonte')
    }
  }
  return entries
}

async function plan(options: ServiceOptions): Promise<Plan> {
  const {
    manifest,
    sources,
    siteUrl,
    signal,
    byteBudget = SITEMAP_RESPONSE_BYTE_BUDGET
  } = options
  validateBudget(byteBudget)
  getRegistry(manifest, sources)
  const pages = cachedPageParts({ manifest, siteUrl, byteBudget })
  const builder = createSitemapIndexBuilder(byteBudget)
  for (const [index] of pages.entries()) {
    builder.add(new URL(`/sitemaps/pages/${index + 1}.xml`, siteUrl).href)
  }
  const legacy = await bounded(signal, async sourceSignal => {
    const entries =
      (await readLegacyPart({ ...options, signal: sourceSignal })) ?? []
    if (entries.length > 0) {
      builder.add(new URL('/sitemaps/legacy.xml', siteUrl).href)
    }
    for (const source of sources) {
      sourceSignal.throwIfAborted()
      const ids = await source.listPartitions(sourceSignal)
      if (
        !Array.isArray(ids) ||
        ids.length > SITEMAP_URL_LIMIT - builder.count()
      ) {
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
    return entries
  })
  const indexCount = builder.count()
  const indexXml = indexCount > 0 ? builder.finish() : undefined
  return { pages, legacy, indexCount, sources, indexXml }
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

export async function buildSitemapIndexResponse(
  options: ServiceOptions
): Promise<Response> {
  try {
    const {
      siteUrl,
      method = 'GET',
      byteBudget = SITEMAP_RESPONSE_BYTE_BUDGET
    } = options
    const result = await plan(options)
    if (result.pages.length <= 1 && result.sources.length === 0) {
      const entries = [...(result.pages[0] ?? []), ...result.legacy]
      if (entries.length === 0) return errorResponse(HTTP_NOT_FOUND)
      const xml = combinedSitemapXml({ entries, siteUrl, byteBudget })
      if (xml) return xmlResponse({ xml, method })
    }
    if (result.indexCount === 0) return errorResponse(HTTP_NOT_FOUND)
    if (!result.indexXml) throw new Error('Índice ausente')
    return xmlResponse({ xml: result.indexXml, method })
  } catch (error) {
    logServerFailure({
      source: 'sitemap',
      error,
      shouldPrintOriginal: import.meta.env.DEV
    })
    return errorResponse()
  }
}

export async function buildSitemapPartResponse(
  options: PartOptions
): Promise<Response> {
  try {
    const {
      manifest,
      sources,
      siteUrl,
      method = 'GET',
      byteBudget = SITEMAP_RESPONSE_BYTE_BUDGET,
      kind,
      part,
      source: sourceId
    } = options
    validateBudget(byteBudget)
    const registry = getRegistry(manifest, sources)
    const selected =
      kind === 'source' ? registry.get(sourceId ?? '') : undefined
    if (kind === 'source' && !selected) return errorResponse(HTTP_NOT_FOUND)
    let entries: SitemapEntry[]
    switch (kind) {
      case 'pages': {
        const index = Number(part)
        if (
          !Number.isSafeInteger(index) ||
          index < 1 ||
          String(index) !== part
        ) {
          return errorResponse(HTTP_NOT_FOUND)
        }
        const pages = cachedPageParts({ manifest, siteUrl, byteBudget })
        const page = pages[index - 1]
        if (!page) return errorResponse(HTTP_NOT_FOUND)
        entries = page
        break
      }
      case 'legacy': {
        const legacy = await bounded(options.signal, sourceSignal =>
          readLegacyPart({ ...options, signal: sourceSignal })
        )
        if (!legacy) return errorResponse(HTTP_NOT_FOUND)
        entries = legacy
        break
      }
      case 'source': {
        if (!selected) return errorResponse(HTTP_NOT_FOUND)
        const sourceEntries = await readSourcePart(options, selected)
        if (!sourceEntries) return errorResponse(HTTP_NOT_FOUND)
        entries = sourceEntries
        break
      }
      default: {
        return errorResponse(HTTP_NOT_FOUND)
      }
    }
    if (entries.length * locales.length > SITEMAP_URL_LIMIT) {
      throw new Error('Sitemap excede limite de URLs')
    }
    validateLocations(entries, siteUrl)
    const xml = buildSitemap({ entries, siteUrl, byteBudget })
    return xmlResponse({ xml, method })
  } catch (error) {
    logServerFailure({
      source: 'sitemap',
      error,
      shouldPrintOriginal: import.meta.env.DEV
    })
    return errorResponse()
  }
}
