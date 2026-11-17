import { baseLocale, extractLocaleFromUrl } from '@paraglide/runtime.js'
import { pageRoutes } from 'virtual:file-routes'

import { isMarkdownRoute, markdownPath } from '@/helpers/markdownRoute/index.ts'
import { readPublicationPhase } from '@/helpers/readPublicationPhase/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { Router } from '@/router.ts'

import { isPagePath } from '../../../requestClassification/index.ts'
import { MARKDOWN_PRERENDER_PATH } from '../../constants.ts'
import { collectStaticMarkdownPages } from '../collectStaticMarkdownPages/index.ts'
import { uncachedResponse } from '../uncachedResponse/index.ts'

// A page with the static opt-in that the matcher resolves to another route or
// outside the pages would be left out without a warning; the build refuses those
// mismatches. An inherited noindex still excludes the page without an error. The
// locale of each file comes from the URL, so llms-full.txt does not depend on the
// format of the index.
export function listStaticMarkdown(): Response {
  const paths: string[] = []
  const baseLocalePaths: string[] = []
  const mismatches: string[] = []
  for (const page of collectStaticMarkdownPages(pageRoutes)) {
    const url = new URL(resolveSiteUrl(page))
    const info = Router.match(url.href).map(match => match.info)
    if (
      !isPagePath({ pathname: url.pathname, method: 'GET' }) ||
      info.at(-1)?.markdown !== true
    ) {
      mismatches.push(url.pathname)
      continue
    }
    if (!isMarkdownRoute(info)) continue
    const path = markdownPath(url.pathname)
    paths.push(path)
    if (extractLocaleFromUrl(url) === baseLocale) baseLocalePaths.push(path)
  }
  return uncachedResponse(
    Response.json({
      siteUrl: resolveSiteUrl('/'),
      baseLocale,
      paths,
      baseLocalePaths,
      mismatches
    })
  )
}

// The header identifies the Nitro call during the build. In production the file
// already exists; a client cannot trigger rebuilding the inventory through a header.
export function isStaticListing(request: Request): boolean {
  return (
    readPublicationPhase() !== 'artifact' &&
    request.headers.has('x-nitro-prerender') &&
    new URL(request.url).pathname === MARKDOWN_PRERENDER_PATH
  )
}
