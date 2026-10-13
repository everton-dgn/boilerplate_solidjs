import type { RouteDefinition } from '@solidjs/router'

import { SiteArticle } from '@/components/organisms/SiteArticle/index.tsx'

import { content } from './content.ts'
import { seo } from './seo.ts'

export const route = {
  info: {
    llms: true,
    markdown: { source: '@/routes/(base)/contact/markdown.ts' },
    seo
  }
} satisfies RouteDefinition

export default function Contact() {
  return <SiteArticle page={content} />
}
