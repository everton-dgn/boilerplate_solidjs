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

// Uma página com opt-in estático que o matcher resolve para outra rota ou para
// fora das páginas seria omitida sem aviso; o build recusa essas divergências.
// O noindex herdado continua excluindo a página sem erro. O idioma de cada
// arquivo vem da URL, para o llms-full.txt não depender do formato do índice.
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

// O header identifica a chamada do Nitro durante o build. Em produção o arquivo
// já existe; um cliente não pode provocar a reconstrução do inventário por header.
export function isStaticListing(request: Request): boolean {
  return (
    readPublicationPhase() !== 'artifact' &&
    request.headers.has('x-nitro-prerender') &&
    new URL(request.url).pathname === MARKDOWN_PRERENDER_PATH
  )
}
