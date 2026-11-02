import type { APIEvent } from 'filesystem-routing/api'

import { HTTP_NOT_FOUND } from '@/constants/http.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { sitemapSources } from '@/infra/server/sitemapSources/index.ts'
import { readSitemapContext } from '@/routes/(seo)/sitemap/helpers/readSitemapContext/index.ts'
import { buildSitemapPartResponse } from '@/routes/(seo)/sitemap/helpers/sitemapService/index.ts'

const SOURCE_SEGMENT_FROM_END = -2

function respond({ request }: APIEvent): Promise<Response> {
  const segments = new URL(request.url).pathname.split('/')
  const segment = segments.at(-1) ?? ''
  if (!segment.endsWith('.xml')) {
    return Promise.resolve(
      new Response(null, {
        status: HTTP_NOT_FOUND,
        headers: { 'cache-control': 'no-store' }
      })
    )
  }
  const part = segment.slice(0, -'.xml'.length)
  const source = segments.at(SOURCE_SEGMENT_FROM_END) ?? ''
  return buildSitemapPartResponse({
    ...readSitemapContext(),
    sources: sitemapSources,
    siteUrl: resolveSiteUrl('/'),
    signal: request.signal,
    kind: 'source',
    source,
    part,
    method: request.method
  })
}

export function GET(event: APIEvent): Promise<Response> {
  return respond(event)
}
export function HEAD(event: APIEvent): Promise<Response> {
  return respond(event)
}
