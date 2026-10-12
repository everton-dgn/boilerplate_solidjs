import '@solidjs/router'
import type { LlmsRouteInfo } from './llms.ts'
import type { SeoRouteInfo } from './seo.ts'
import type { SitePage } from './site-page.ts'
import type { SitemapRouteInfo } from './sitemap.ts'

declare module '@solidjs/router' {
  interface RouteInfo {
    content?: () => SitePage
    seo?: SeoRouteInfo
    llms?: LlmsRouteInfo
    sitemap?: SitemapRouteInfo
  }
}
