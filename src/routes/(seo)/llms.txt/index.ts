import { pageRoutes } from 'virtual:file-routes'

import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'
import { SITE } from '@/constants/site.ts'
import { memoizeOnce } from '@/helpers/memoizeOnce/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { localizeHref } from '@/i18n/urls/index.ts'
import { baseLocale } from '@/paraglide/runtime.js'

import { LLMS_NOTES } from './constants.ts'
import { buildLlmsText } from './helpers/buildLlmsText/index.ts'
import { collectLlmsPages } from './helpers/collectLlmsPages/index.ts'

const renderLlmsText = memoizeOnce({
  enabled: import.meta.env.PROD,
  render: () =>
    buildLlmsText({
      title: SITE.title,
      description: SITE.description,
      notes: LLMS_NOTES,
      pages: collectLlmsPages(pageRoutes).map(page => {
        page.path = localizeHref({ href: page.path, locale: baseLocale })
        return page
      }),
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
