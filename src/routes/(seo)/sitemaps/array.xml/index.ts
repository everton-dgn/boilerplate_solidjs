import type { APIEvent } from 'filesystem-routing/api'

import { sitemapSources } from '@/infra/server/sitemapSources/index.ts'
import { createArrayPartRoute } from '@/routes/(seo)/sitemap/helpers/sitemapRoutes/index.ts'

const respond = createArrayPartRoute(sitemapSources)

export function GET(event: APIEvent): Promise<Response> {
  return respond(event)
}
export function HEAD(event: APIEvent): Promise<Response> {
  return respond(event)
}
