import type { RouteDefinition } from '@solidjs/router'

import { SiteArticle } from '@/components/organisms/SiteArticle/index.tsx'
import { readSitePage } from '@/data/readSitePage/index.ts'

export const route = {
  info: {
    llms: true,
    seo: {
      get title() {
        return readSitePage('/contact').title
      },
      get description() {
        return readSitePage('/contact').description
      }
    }
  }
} satisfies RouteDefinition

export default function Contact() {
  return <SiteArticle page={readSitePage('/contact')} />
}
