import type { APIEvent } from 'filesystem-routing/api'

import { createSourcePartRoute } from '@/routes/(seo)/sitemap/helpers/sitemapRoutes/index.ts'
import { fixtureSitemapSources } from '@/tests/fixtures/e2e/sitemapSources/index.ts'

const respond = createSourcePartRoute(fixtureSitemapSources)

export function GET(event: APIEvent): Promise<Response> {
  return respond(event)
}
export function HEAD(event: APIEvent): Promise<Response> {
  return respond(event)
}
