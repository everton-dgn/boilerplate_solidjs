import { locales } from '@paraglide/runtime.js'

import type { SitemapEntry } from '@/@types/sitemap.ts'
import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'
import { HTTP_NOT_FOUND, HTTP_SERVICE_UNAVAILABLE } from '@/constants/http.ts'
import { logServerFailure } from '@/infra/server/logServerFailure/index.ts'
import { SITEMAP_URL_LIMIT } from '@/routes/(seo)/sitemap/constants.ts'

import {
  buildSitemap,
  SitemapByteLimitError
} from '../../../buildSitemap/index.ts'
import { validateLocations } from '../../../sitemapCatalog/index.ts'
import type {
  PagePartsOptions,
  ReadOptions,
  ServiceOptions
} from '../../types.ts'
import { planIndex } from '../planIndex/index.ts'

type XmlResponseOptions = { xml: string; method: string }
type RenderOptions = {
  entries: readonly SitemapEntry[]
  options: ServiceOptions
  byteBudget: number
}

const encoder = new TextEncoder()

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

export function errorResponse(status = HTTP_SERVICE_UNAVAILABLE): Response {
  return new Response(null, {
    status,
    headers: { 'cache-control': 'no-store' }
  })
}

export function reportFailure(error: unknown): Response {
  logServerFailure({
    source: 'sitemap',
    error,
    shouldPrintOriginal: import.meta.env.DEV
  })
  return errorResponse()
}

export function renderPart({
  entries,
  options,
  byteBudget
}: RenderOptions): Response {
  const { siteUrl, method = 'GET' } = options
  if (entries.length * locales.length > SITEMAP_URL_LIMIT) {
    throw new Error('Sitemap excede limite de URLs')
  }
  validateLocations({ entries, siteUrl })
  const xml = buildSitemap({ entries, siteUrl, byteBudget })
  return xmlResponse({ xml, method })
}

export async function respondIndex(read: ReadOptions): Promise<Response> {
  const { options, catalog, byteBudget } = read
  const { siteUrl, sources, method = 'GET' } = options
  const { partCount, arrayEntries, indexCount, indexXml } =
    await planIndex(read)
  if (partCount <= 1 && sources.length === 0) {
    const entries = [...(await catalog.readSinglePart()), ...arrayEntries]
    if (entries.length === 0) return errorResponse(HTTP_NOT_FOUND)
    const xml = combinedSitemapXml({ entries, siteUrl, byteBudget })
    if (xml) return xmlResponse({ xml, method })
  }
  if (indexCount === 0) return errorResponse(HTTP_NOT_FOUND)
  if (!indexXml) throw new Error('Índice ausente')
  return xmlResponse({ xml: indexXml, method })
}
