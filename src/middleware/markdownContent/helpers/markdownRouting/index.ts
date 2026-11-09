import { isMarkdownRoute, markdownPath } from '@/helpers/markdownRoute/index.ts'
import { Router } from '@/router.ts'

import { isPagePath } from '../../../requestClassification/index.ts'

type RouteRequest = { request: Request; url: URL; isPublished: boolean }

// Sem opt-in, só o 404 da rota catch-all vira Markdown.
function isCatchAllRoute(url: URL): boolean {
  return Router.match(url.href).at(-1)?.pattern.includes('*') === true
}

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

// Pedido autenticado e página sem opt-in, fora o 404 da catch-all, só têm a
// representação HTML.
export function isHtmlOnly({
  request,
  url,
  isPublished
}: RouteRequest): boolean {
  return (
    request.headers.has('authorization') ||
    (!isPublished && !isCatchAllRoute(url))
  )
}

// Só a forma canônica publica: /pt.md ou /pt/about/.md duplicariam páginas
// fora dos arquivos estáticos.
export function isUnpublished(route: RouteRequest): boolean {
  return (
    markdownPath(route.url.pathname) !== new URL(route.request.url).pathname ||
    isHtmlOnly(route)
  )
}
