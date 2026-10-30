import { m } from '@paraglide/messages.js'
import type { RouteDefinition } from '@solidjs/router'

import type { SitePage } from '@/@types/site-page.ts'
import { SiteArticle } from '@/components/organisms/SiteArticle/index.tsx'
import { SITE } from '@/constants/site/index.ts'
import { SITE_LINKS } from '@/constants/siteLinks/index.ts'

import { seo } from './seo.ts'

const content = {
  get title() {
    return m.contact_title()
  },
  get intro() {
    return m.contact_intro()
  },
  get sections() {
    return [
      {
        title: m.contact_issuesTitle(),
        paragraphs: [m.contact_issues()]
      },
      {
        title: m.contact_maintainerTitle(),
        paragraphs: [m.contact_maintainer()]
      }
    ]
  },
  get links() {
    return [
      ...SITE_LINKS.pages,
      { label: m.contact_issuesLabel(), href: `${SITE.repositoryUrl}/issues` },
      { label: m.contact_maintainerLabel(), href: SITE.author.url }
    ]
  }
} satisfies SitePage

export const route = {
  info: {
    llms: true,
    markdown: true,
    seo
  }
} satisfies RouteDefinition

export default function Contact() {
  return <SiteArticle page={content} />
}
