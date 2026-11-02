import type { APIEvent } from 'filesystem-routing/api'

import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { sitemapSources } from '@/infra/server/sitemapSources/index.ts'
import { readSitemapContext } from '@/routes/(seo)/sitemap/helpers/readSitemapContext/index.ts'

import { buildSitemapIndexResponse } from '../sitemap/helpers/sitemapService/index.ts'

export function GET({ request }: APIEvent): Promise<Response> {
  return buildSitemapIndexResponse({
    ...readSitemapContext(),
    sources: sitemapSources,
    siteUrl: resolveSiteUrl('/'),
    signal: request.signal
  })
}

export function HEAD({ request }: APIEvent): Promise<Response> {
  return buildSitemapIndexResponse({
    ...readSitemapContext(),
    sources: sitemapSources,
    siteUrl: resolveSiteUrl('/'),
    signal: request.signal,
    method: 'HEAD'
  })
}
