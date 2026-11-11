import { sitemapSources } from '@/infra/server/sitemapSources/index.ts'
import { createSourcePartRoute } from '@/routes/(seo)/sitemap/helpers/sitemapRoutes/index.ts'

export const GET = createSourcePartRoute(sitemapSources)
