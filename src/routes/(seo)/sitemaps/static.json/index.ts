import { sitemapSources } from '@/infra/server/sitemapSources/index.ts'
import { createInventoryRoute } from '@/routes/(seo)/sitemap/helpers/sitemapRoutes/index.ts'

export const GET = createInventoryRoute(sitemapSources)
