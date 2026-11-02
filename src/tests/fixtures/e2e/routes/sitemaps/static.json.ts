import { HTTP_NOT_FOUND } from '@/constants/http.ts'
import { readPublicationPhase } from '@/helpers/readPublicationPhase/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { readSitemapContext } from '@/routes/(seo)/sitemap/helpers/readSitemapContext/index.ts'
import { buildSitemapInventoryResponse } from '@/routes/(seo)/sitemap/helpers/sitemapService/index.ts'
import { fixtureSitemapSources } from '@/tests/fixtures/e2e/sitemapSources/index.ts'

export function GET(): Promise<Response> {
  if (readPublicationPhase() !== 'prerender') {
    return Promise.resolve(
      new Response(null, {
        status: HTTP_NOT_FOUND,
        headers: { 'cache-control': 'no-store' }
      })
    )
  }
  return buildSitemapInventoryResponse({
    ...readSitemapContext(),
    sources: fixtureSitemapSources,
    siteUrl: resolveSiteUrl('/')
  })
}
