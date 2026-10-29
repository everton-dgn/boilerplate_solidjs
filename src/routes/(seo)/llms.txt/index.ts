import { baseLocale } from '@paraglide/runtime.js'
import { pageRoutes } from 'virtual:file-routes'

import type { LlmsPage } from '@/@types/llms.ts'
import { SITE } from '@/constants/site.ts'
import { isMarkdownRoute, markdownPath } from '@/helpers/markdownRoute/index.ts'
import { memoizeOnce } from '@/helpers/memoizeOnce/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { localizeHref } from '@/i18n/urls/index.ts'
import { Router } from '@/router.ts'

import { LLMS_NOTES, LLMS_USE_CASES } from './constants.ts'
import { buildLlmsResponse } from './helpers/buildLlmsResponse/index.ts'
import { buildLlmsText } from './helpers/buildLlmsText/index.ts'
import { collectLlmsPages } from './helpers/collectLlmsPages/index.ts'

function localizePage(page: LlmsPage): LlmsPage {
  const path = localizeHref({ href: page.path, locale: baseLocale })
  return {
    ...page,
    path: isMarkdownRoute(
      Router.match(resolveSiteUrl(path)).map(match => match.info)
    )
      ? markdownPath(path)
      : path
  }
}

function collectPages(): LlmsPage[] {
  const pages = [...LLMS_USE_CASES, ...collectLlmsPages(pageRoutes)].map(page =>
    localizePage(page)
  )
  return pages
}

const renderLlmsText = memoizeOnce({
  isEnabled: import.meta.env.PROD,
  render: () =>
    buildLlmsText({
      title: SITE.title,
      description: SITE.description,
      notes: LLMS_NOTES,
      pages: collectPages(),
      siteUrl: resolveSiteUrl('/')
    })
})

export function GET(): Promise<Response> {
  return buildLlmsResponse(renderLlmsText)
}
