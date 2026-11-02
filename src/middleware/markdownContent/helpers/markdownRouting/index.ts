import { isMarkdownRoute, markdownPath } from '@/helpers/markdownRoute/index.ts'
import { Router } from '@/router.ts'

import { isPagePath } from '../../../requestClassification/index.ts'

type RouteRequest = { request: Request; url: URL; isPublished: boolean }

export function documentUrl(request: Request): URL {
  const url = new URL(request.url)
  if (!url.pathname.endsWith('.md')) return url
  const page = url.pathname.slice(0, -'.md'.length)
  url.pathname = page.endsWith('/index')
    ? page.slice(0, -'/index'.length) || '/'
    : page
  return url
}

export function isEligible(url: URL): boolean {
  return (
    isPagePath({ pathname: url.pathname, method: 'GET' }) &&
    isMarkdownRoute(Router.match(url.href).map(match => match.info))
  )
}

// Só a forma canônica publica: /pt.md ou /pt/about/.md duplicariam páginas
// fora dos arquivos estáticos.
export function isUnpublished({
  request,
  url,
  isPublished
}: RouteRequest): boolean {
  return (
    markdownPath(url.pathname) !== new URL(request.url).pathname ||
    request.headers.has('authorization') ||
    (!isPublished && !Router.match(url.href).at(-1)?.pattern.includes('*'))
  )
}
