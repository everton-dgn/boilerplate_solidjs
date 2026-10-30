import { m } from '@paraglide/messages.js'
import type { RouteDefinition } from '@solidjs/router'

import type { SitePage } from '@/@types/site-page.ts'
import { SiteArticle } from '@/components/organisms/SiteArticle/index.tsx'
import { SITE_LINKS } from '@/constants/siteLinks/index.ts'

import { seo } from './seo.ts'

const content = {
  get title() {
    return m.about_title()
  },
  get description() {
    return m.about_description()
  },
  get intro() {
    return m.about_intro()
  },
  get sections() {
    return [
      {
        title: m.about_purposeTitle(),
        paragraphs: [m.about_purpose()]
      },
      {
        title: m.about_sourceTitle(),
        paragraphs: [m.about_source()]
      }
    ]
  },
  get links() {
    return [...SITE_LINKS.pages, ...SITE_LINKS.sources]
  }
} satisfies SitePage

export const route = {
  info: {
    llms: true,
    markdown: true,
    seo
  }
} satisfies RouteDefinition

export default function About() {
  return <SiteArticle page={content} />
}
