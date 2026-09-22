import * as v from 'valibot'

import type { SitemapEntry, SitemapRouteInfo } from '@/@types/sitemap.ts'
import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'

import { SITEMAP_SOURCES_TIMEOUT_MS } from '../../constants.ts'
import type { SitemapManifest } from '../../types.ts'
import { buildSitemap } from '../buildSitemap/index.ts'
import { normalizeSitemapEntries } from '../normalizeSitemapEntries/index.ts'

type BuildSitemapResponseOptions = {
  manifest: SitemapManifest
  siteUrl: string
}

const HTTP_SERVICE_UNAVAILABLE = 503
const SITEMAP_BYTE_LIMIT = 52_428_800

// Fronteira com as fontes: só `path` e `lastmod` seguem adiante.
const EntrySchema = v.object({
  path: v.string(),
  lastmod: v.optional(v.string())
})
const EntriesSchema = v.array(EntrySchema)

// Uma fonte síncrona vira promise para correr junto com as demais.
function readSource(
  source: SitemapRouteInfo
): Promise<readonly SitemapEntry[]> {
  return Promise.resolve(source())
}

// Todas as fontes rodam em paralelo, com um prazo total; o timer é limpo ao
// fim para não segurar o processo.
async function readSources(
  sources: readonly SitemapRouteInfo[]
): Promise<SitemapEntry[]> {
  const { promise: timeout, reject } = Promise.withResolvers<never>()
  const timer = setTimeout(
    () => reject(new Error('Fontes do sitemap sem resposta a tempo')),
    SITEMAP_SOURCES_TIMEOUT_MS
  )
  try {
    const results = await Promise.race([
      Promise.all(sources.map(source => readSource(source))),
      timeout
    ])
    return results.flatMap(result => v.parse(EntriesSchema, result))
  } finally {
    clearTimeout(timer)
  }
}

// Qualquer falha (fonte rejeitada, entrada inválida, prazo ou limite) vira
// 503 sem corpo e sem cache: o crawler tenta de novo e o CDN mantém a última
// cópia boa. Um sitemap parcial em cache esconderia a falha por uma hora.
export async function buildSitemapResponse({
  manifest,
  siteUrl
}: BuildSitemapResponseOptions): Promise<Response> {
  let xml: string
  try {
    const dynamic = await readSources(manifest.sources)
    const entries = normalizeSitemapEntries([...manifest.entries, ...dynamic])
    xml = buildSitemap({ entries, siteUrl })
    if (new TextEncoder().encode(xml).byteLength > SITEMAP_BYTE_LIMIT) {
      throw new Error('Sitemap acima do limite de bytes')
    }
  } catch {
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
