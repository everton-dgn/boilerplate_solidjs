import type { RouteDefinition } from '@solidjs/router'

import { SiteArticle } from '@/components/organisms/SiteArticle/index.tsx'
import { readSitePage } from '@/data/readSitePage/index.ts'

export const route = {
  info: {
    llms: true,
    seo: {
      get title() {
        return readSitePage('/privacy').title
      },
      get description() {
        return readSitePage('/privacy').description
      }
    }
  }
} satisfies RouteDefinition

export default function Privacy() {
  return <SiteArticle page={readSitePage('/privacy')} />
}
