import type { APIEvent } from 'filesystem-routing/api'

import { sitemapSources } from '@/infra/server/sitemapSources/index.ts'
import { createPagePartRoute } from '@/routes/(seo)/sitemap/helpers/sitemapRoutes/index.ts'

const respond = createPagePartRoute(sitemapSources)

export function GET(event: APIEvent): Promise<Response> {
  return respond(event)
}
export function HEAD(event: APIEvent): Promise<Response> {
  return respond(event)
}
