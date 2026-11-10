import { sitemapSources } from '@/infra/server/sitemapSources/index.ts'
import { createPagePartRoute } from '@/routes/(seo)/sitemap/helpers/sitemapRoutes/index.ts'

export const GET = createPagePartRoute(sitemapSources)
