import { sitemapSources } from '@/infra/server/sitemapSources/index.ts'
import { createIndexRoute } from '@/routes/(seo)/sitemap/helpers/sitemapRoutes/index.ts'

export const GET = createIndexRoute(sitemapSources)
