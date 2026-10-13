import '@solidjs/router'
import type { LlmsRouteInfo } from './llms.ts'
import type { MarkdownRouteInfo } from './markdown.ts'
import type { SeoRouteInfo } from './seo.ts'
import type { SitemapRouteInfo } from './sitemap.ts'

declare module '@solidjs/router' {
  interface RouteInfo {
    markdown?: MarkdownRouteInfo
    seo?: SeoRouteInfo
    llms?: LlmsRouteInfo
    sitemap?: SitemapRouteInfo
  }
}
