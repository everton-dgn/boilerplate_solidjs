import { baseLocale } from '@paraglide/runtime.js'
import { paraglideMiddleware } from '@paraglide/server.js'
import { pageRoutes } from 'virtual:file-routes'

import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'
import { SITE } from '@/constants/site/index.ts'
import { isMarkdownRoute, markdownPath } from '@/helpers/markdownRoute/index.ts'
import { memoizeOnce } from '@/helpers/memoizeOnce/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { localizeHref } from '@/i18n/urls/index.ts'
import { Router } from '@/router.ts'

import { LLMS_NOTES, LLMS_USE_CASES } from './constants.ts'
import { buildLlmsText } from './helpers/buildLlmsText/index.ts'
import { collectLlmsPages } from './helpers/collectLlmsPages/index.ts'
import type { LlmsPage } from './types.ts'

function localizePage(page: LlmsPage): LlmsPage {
  const path = localizeHref({ href: page.path, locale: baseLocale })
  return {
    ...page,
    path: isMarkdownRoute(Router.match(path).map(match => match.info))
      ? markdownPath(path)
      : path
  }
}

function collectPages(): LlmsPage[] {
  return [...LLMS_USE_CASES, ...collectLlmsPages(pageRoutes)].map(page =>
    localizePage(page)
  )
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

// A descrição do site e os metadados das páginas leem o idioma do contexto
// Paraglide. O índice sai sempre no idioma base, inclusive na primeira
// requisição, que fica guardada em produção.
export function GET(): Promise<Response> {
  const url = resolveSiteUrl(localizeHref({ href: '/', locale: baseLocale }))
  return paraglideMiddleware(
    new Request(url),
    () =>
      new Response(renderLlmsText(), {
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'cache-control': SITE_CACHE_CONTROL
        }
      })
  )
}
