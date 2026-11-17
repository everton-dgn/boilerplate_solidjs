import { baseLocale } from '@paraglide/runtime.js'
import { paraglideMiddleware } from '@paraglide/server.js'
import { pageRoutes } from 'virtual:file-routes'

import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'
import { HTTP_SERVICE_UNAVAILABLE } from '@/constants/http.ts'
import { SITE } from '@/constants/site/index.ts'
import { isMarkdownRoute, markdownPath } from '@/helpers/markdownRoute/index.ts'
import { memoizeOnce } from '@/helpers/memoizeOnce/index.ts'
import { readPublicationPhase } from '@/helpers/readPublicationPhase/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { localizeHref } from '@/i18n/urls/index.ts'
import { logServerFailure } from '@/infra/server/logServerFailure/index.ts'
import { Router } from '@/router.ts'

import { LLMS_FULL_PAGE, LLMS_NOTES, LLMS_USE_CASES } from './constants.ts'
import { buildLlmsText } from './helpers/buildLlmsText/index.ts'
import { collectLlmsPages } from './helpers/collectLlmsPages/index.ts'
import type { LlmsPage } from './types.ts'

type LocalizedPage = { page: LlmsPage; hasStaticMarkdown: boolean }

const ROUTE_PARAMETER = /[:*]/u

// Only `markdown: true` on a route without a parameter becomes a file in the
// build; `dynamic` and parameters are still converted on the request.
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

// The build checks that the announcement matches the llms-full.txt documents.
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

// The build file serves this URL before the function. Getting here in production
// means a missing artifact, which must not turn into an O(N) rebuild per instance.
function missingArtifact(): Response {
  logServerFailure({
    source: 'llms',
    error: new Error('llms.txt outside the file layer')
  })
  return new Response(null, {
    status: HTTP_SERVICE_UNAVAILABLE,
    headers: { 'cache-control': 'no-store' }
  })
}

// The site description and the page metadata read the locale of the Paraglide
// context. The index always goes out in the base locale, including on the first
// request, which is kept in production.
export function GET(): Promise<Response> {
  if (readPublicationPhase() === 'artifact') {
    return Promise.resolve(missingArtifact())
  }
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
