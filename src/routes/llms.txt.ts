import { pageRoutes } from 'virtual:file-routes'

import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'
import { SITE } from '@/constants/site.ts'
import { memoizeOnce } from '@/helpers/memoizeOnce/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'

import { buildLlmsText } from './buildLlmsText/index.ts'
import { collectLlmsPages } from './collectLlmsPages/index.ts'

const renderLlmsText = memoizeOnce({
  enabled: import.meta.env.PROD,
  render: () =>
    buildLlmsText({
      title: SITE.title,
      description: SITE.description,
      pages: collectLlmsPages(pageRoutes),
      siteUrl: resolveSiteUrl('/')
    })
})

export function GET(): Response {
  return new Response(renderLlmsText(), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': SITE_CACHE_CONTROL
    }
  })
}
