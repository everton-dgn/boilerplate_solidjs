import type { APIEvent } from 'filesystem-routing/api'

import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { sitemapSources } from '@/infra/server/sitemapSources/index.ts'
import { readSitemapContext } from '@/routes/(seo)/sitemap/helpers/readSitemapContext/index.ts'
import { buildSitemapPartResponse } from '@/routes/(seo)/sitemap/helpers/sitemapService/index.ts'

function respond({ request }: APIEvent): Promise<Response> {
  const part =
    new URL(request.url).pathname
      .split('/')
      .at(-1)
      ?.replace(/\.xml$/u, '') ?? ''
  return buildSitemapPartResponse({
    ...readSitemapContext(),
    sources: sitemapSources,
    siteUrl: resolveSiteUrl('/'),
    signal: request.signal,
    kind: 'pages',
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
