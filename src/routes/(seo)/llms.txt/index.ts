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

import { LLMS_FULL_PAGE, LLMS_NOTES, LLMS_USE_CASES } from './constants.ts'
import { buildLlmsText } from './helpers/buildLlmsText/index.ts'
import { collectLlmsPages } from './helpers/collectLlmsPages/index.ts'
import type { LlmsPage } from './types.ts'

type LocalizedPage = { page: LlmsPage; hasStaticMarkdown: boolean }

const ROUTE_PARAMETER = /[:*]/u

// Só `markdown: true` numa rota sem parâmetro vira arquivo no build; `dynamic`
// e parâmetros continuam convertidos na requisição.
function localizePage(page: LlmsPage): LocalizedPage {
  const path = localizeHref({ href: page.path, locale: baseLocale })
  const matches = Router.match(path)
  const info = matches.map(match => match.info)
  if (!isMarkdownRoute(info)) {
    return { page: { ...page, path }, hasStaticMarkdown: false }
  }
  return {
    page: { ...page, path: markdownPath(path) },
    hasStaticMarkdown:
      info.at(-1)?.markdown === true &&
      !ROUTE_PARAMETER.test(matches.at(-1)?.pattern ?? '')
  }
}

// O build confere que o anúncio coincide com os documentos do llms-full.txt.
function collectPages(): LlmsPage[] {
  const localized = [...LLMS_USE_CASES, ...collectLlmsPages(pageRoutes)].map(
    page => localizePage(page)
  )
  const pages = localized.map(({ page }) => page)
  return localized.some(({ hasStaticMarkdown }) => hasStaticMarkdown)
    ? [...pages, LLMS_FULL_PAGE]
    : pages
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
