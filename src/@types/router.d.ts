import '@solidjs/router'
import type { LlmsRouteInfo } from './llms.ts'
import type { SeoRouteInfo } from './seo.ts'
import type { SitemapRouteInfo } from './sitemap.ts'

declare module '@solidjs/router' {
  interface RouteInfo {
    // `true` gera o Markdown no build; `'dynamic'` converte a cada requisição.
    markdown?: boolean | 'dynamic'
    seo?: SeoRouteInfo
    llms?: LlmsRouteInfo
    sitemap?: SitemapRouteInfo
  }
}
