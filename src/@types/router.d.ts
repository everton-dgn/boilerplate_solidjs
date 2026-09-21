import '@solidjs/router'
import type { LlmsRouteInfo } from './llms.ts'
import type { SeoRouteInfo } from './seo.ts'

declare module '@solidjs/router' {
  interface RouteInfo {
    seo?: SeoRouteInfo
    llms?: LlmsRouteInfo
  }
}
