import { baseLocale } from '@paraglide/runtime.js'
import { pageRoutes } from 'virtual:file-routes'

import type { LlmsPage } from '@/@types/llms.ts'
import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'
import { SITE } from '@/constants/site.ts'
import { memoizeOnce } from '@/helpers/memoizeOnce/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { localizeHref } from '@/i18n/urls/index.ts'

import { LLMS_NOTES, LLMS_USE_CASES } from './constants.ts'
import { buildLlmsText } from './helpers/buildLlmsText/index.ts'
import { collectLlmsPages } from './helpers/collectLlmsPages/index.ts'

function localizePage(page: LlmsPage): LlmsPage {
  return {
    ...page,
    path: localizeHref({ href: page.path, locale: baseLocale })
  }
}

const renderLlmsText = memoizeOnce({
  enabled: import.meta.env.PROD,
  render: () =>
    buildLlmsText({
      title: SITE.title,
      description: SITE.description,
      notes: LLMS_NOTES,
      pages: [...LLMS_USE_CASES, ...collectLlmsPages(pageRoutes)].map(page =>
        localizePage(page)
      ),
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
