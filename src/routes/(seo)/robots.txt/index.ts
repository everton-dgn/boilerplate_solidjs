import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'
import { memoizeOnce } from '@/helpers/memoizeOnce/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'

import { buildRobotsText } from './buildRobotsText/index.ts'
import { ROBOTS_GROUPS } from './constants.ts'

const renderRobotsText = memoizeOnce({
  enabled: import.meta.env.PROD,
  render: () =>
    buildRobotsText({
      groups: ROBOTS_GROUPS,
      sitemaps: [resolveSiteUrl('/sitemap.xml')]
    })
})

export function GET(): Response {
  return new Response(renderRobotsText(), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': SITE_CACHE_CONTROL
    }
  })
}
