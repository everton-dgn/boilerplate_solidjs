import { locales } from '@paraglide/runtime.js'
import * as v from 'valibot'

import type { SitemapEntry, SitemapRouteInfo } from '@/@types/sitemap.ts'
import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'
import { HTTP_SERVICE_UNAVAILABLE } from '@/constants/http.ts'
import { logServerFailure } from '@/infra/server/logServerFailure/index.ts'

import {
  SITEMAP_SOURCES_TIMEOUT_MS,
  SITEMAP_URL_LIMIT
} from '../../constants.ts'
import type { SitemapManifest } from '../../types.ts'
import { buildSitemap } from '../buildSitemap/index.ts'
import { normalizeSitemapEntries } from '../normalizeSitemapEntries/index.ts'

type BuildSitemapResponseOptions = {
  manifest: SitemapManifest
  siteUrl: string
  signal: AbortSignal
}

type ReadSourcesOptions = {
  sources: readonly SitemapRouteInfo[]
  signal: AbortSignal
}

type ReadSourceOptions = {
  source: SitemapRouteInfo
  signal: AbortSignal
}

const SITEMAP_BYTE_LIMIT = 52_428_800

const EntrySchema = v.object({
  path: v.string(),
  lastmod: v.optional(v.string())
})
const EntriesSchema = v.array(EntrySchema)

async function readSource({
  source,
  signal
}: ReadSourceOptions): Promise<readonly SitemapEntry[]> {
  return source(signal)
}

// O sinal das fontes junta o prazo e a desconexão do cliente. A corrida contra
// o abort cobre a fonte que ignora o sinal; o abort ao fim da leitura cancela
// as fontes que ainda rodam depois de outra falhar.
async function readSources({
  sources,
  signal
}: ReadSourcesOptions): Promise<SitemapEntry[]> {
  const deadline = new AbortController()
  const timer = setTimeout(() => {
    deadline.abort(new Error('Fontes do sitemap sem resposta a tempo'))
  }, SITEMAP_SOURCES_TIMEOUT_MS)
  const sourceSignal = AbortSignal.any([signal, deadline.signal])
  const aborted = Promise.withResolvers<never>()
  const onAbort = () => {
    aborted.reject(new Error('Leitura das fontes do sitemap interrompida'))
  }
  try {
    sourceSignal.throwIfAborted()
    sourceSignal.addEventListener('abort', onAbort, { once: true })
    const results = await Promise.race([
      Promise.all(
        sources.map(source => readSource({ source, signal: sourceSignal }))
      ),
      aborted.promise
    ])
    return results.flatMap(result => v.parse(EntriesSchema, result))
  } finally {
    clearTimeout(timer)
    sourceSignal.removeEventListener('abort', onAbort)
    deadline.abort()
  }
}

// Um sitemap parcial em cache esconderia falhas; retorne 503 sem cache.
export async function buildSitemapResponse({
  manifest,
  siteUrl,
  signal
}: BuildSitemapResponseOptions): Promise<Response> {
  let xml: string
  try {
    const dynamic = await readSources({ sources: manifest.sources, signal })
    const entries = normalizeSitemapEntries({
      entries: [...manifest.entries, ...dynamic],
      siteUrl
    })
    if (entries.length * locales.length > SITEMAP_URL_LIMIT) {
      throw new Error('Sitemap acima do limite de URLs após localização')
    }
    xml = buildSitemap({ entries, siteUrl })
    if (new TextEncoder().encode(xml).byteLength > SITEMAP_BYTE_LIMIT) {
      throw new Error('Sitemap acima do limite de bytes')
    }
  } catch (error) {
    logServerFailure({
      source: 'sitemap',
      error,
      shouldPrintOriginal: import.meta.env.DEV
    })
    return new Response(null, {
      status: HTTP_SERVICE_UNAVAILABLE,
      headers: { 'cache-control': 'no-store' }
    })
  }
  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': SITE_CACHE_CONTROL
    }
  })
}
