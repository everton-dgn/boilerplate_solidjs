import { createSourcePartRoute } from '@/routes/(seo)/sitemap/helpers/sitemapRoutes/index.ts'
import { fixtureSitemapSources } from '@/tests/fixtures/e2e/sitemapSources/index.ts'

export const GET = createSourcePartRoute(fixtureSitemapSources)
