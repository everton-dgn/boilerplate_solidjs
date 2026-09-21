import { pageRoutes } from 'virtual:file-routes'

import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'
import { memoizeOnce } from '@/helpers/memoizeOnce/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'

import { buildSitemap } from './helpers/buildSitemap/index.ts'
import { collectStaticPaths } from './helpers/collectStaticPaths/index.ts'

const renderSitemap = memoizeOnce({
  enabled: import.meta.env.PROD,
  render: () =>
    buildSitemap({
      paths: collectStaticPaths(pageRoutes),
      siteUrl: resolveSiteUrl('/')
    })
})

export function GET(): Response {
  return new Response(renderSitemap(), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': SITE_CACHE_CONTROL
    }
  })
}
