import { sitemapSources } from '@/infra/server/sitemapSources/index.ts'
import { createArrayPartRoute } from '@/routes/(seo)/sitemap/helpers/sitemapRoutes/index.ts'

export const GET = createArrayPartRoute(sitemapSources)
