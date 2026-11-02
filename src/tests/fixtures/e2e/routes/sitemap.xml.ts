import type { APIEvent } from 'filesystem-routing/api'

import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { readSitemapContext } from '@/routes/(seo)/sitemap/helpers/readSitemapContext/index.ts'
import { buildSitemapIndexResponse } from '@/routes/(seo)/sitemap/helpers/sitemapService/index.ts'
import { fixtureSitemapSources } from '@/tests/fixtures/e2e/sitemapSources/index.ts'

function respond({ request }: APIEvent): Promise<Response> {
  return buildSitemapIndexResponse({
    ...readSitemapContext(),
    sources: fixtureSitemapSources,
    siteUrl: resolveSiteUrl('/'),
    signal: request.signal,
    method: request.method
  })
}

export function GET(event: APIEvent): Promise<Response> {
  return respond(event)
}
export function HEAD(event: APIEvent): Promise<Response> {
  return respond(event)
}
