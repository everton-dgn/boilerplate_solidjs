import { m } from '@paraglide/messages.js'

import type { SeoRouteInfo } from '@/@types/seo.ts'
import type { SitePage } from '@/@types/site-page.ts'
import { SITE } from '@/constants/site.ts'
import { SITE_LINKS } from '@/constants/siteLinks/index.ts'

export const content = {
  get title() {
    return m.contact_title()
  },
  get description() {
    return m.contact_description()
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

export const seo = {
  get title() {
    return content.title
  },
  get description() {
    return content.description
  }
} satisfies SeoRouteInfo
