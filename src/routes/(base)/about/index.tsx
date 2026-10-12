import type { RouteDefinition } from '@solidjs/router'

import { SiteArticle } from '@/components/organisms/SiteArticle/index.tsx'
import { readSitePage } from '@/data/readSitePage/index.ts'

export const route = {
  info: {
    llms: true,
    seo: {
      get title() {
        return readSitePage('/about').title
      },
      get description() {
        return readSitePage('/about').description
      }
    }
  }
} satisfies RouteDefinition

export default function About() {
  return <SiteArticle page={readSitePage('/about')} />
}
