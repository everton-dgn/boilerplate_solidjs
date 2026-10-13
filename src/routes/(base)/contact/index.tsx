import type { RouteDefinition } from '@solidjs/router'

import { SiteArticle } from '@/components/organisms/SiteArticle/index.tsx'

import { readContent } from './helpers/readContent/index.ts'

export const route = {
  info: {
    llms: true,
    markdown: { source: '@/routes/(base)/contact/helpers/markdown.ts' },
    seo: {
      get title() {
        return readContent().title
      },
      get description() {
        return readContent().description
      }
    }
  }
} satisfies RouteDefinition

export default function Contact() {
  return <SiteArticle page={readContent()} />
}
