import '@solidjs/router'
import type { LlmsRouteInfo } from './llms.ts'
import type { SeoMetadata } from './seo.ts'

declare module '@solidjs/router' {
  interface RouteInfo {
    seo?: Partial<SeoMetadata>
    llms?: LlmsRouteInfo
  }
}
