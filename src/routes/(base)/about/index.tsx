import type { RouteDefinition } from '@solidjs/router'

import { SiteArticle } from '@/components/organisms/SiteArticle/index.tsx'

import { content } from './content.ts'
import { seo } from './seo.ts'

export const route = {
  info: {
    llms: true,
    markdown: { source: '@/routes/(base)/about/markdown.ts' },
    seo
  }
} satisfies RouteDefinition

export default function About() {
  return <SiteArticle page={content} />
}
