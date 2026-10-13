import { m } from '@paraglide/messages.js'

import type { SitePage } from '@/@types/site-page.ts'
import { SITE } from '@/constants/site.ts'
import { SITE_LINKS } from '@/constants/siteLinks/index.ts'

export function readContent(): SitePage {
  return {
    title: m.contact_title(),
    description: m.contact_description(),
    intro: m.contact_intro(),
    sections: [
      {
        title: m.contact_issuesTitle(),
        paragraphs: [m.contact_issues()]
      },
      {
        title: m.contact_maintainerTitle(),
        paragraphs: [m.contact_maintainer()]
      }
    ],
    links: [
      ...SITE_LINKS.pages,
      { label: m.contact_issuesLabel(), href: `${SITE.repositoryUrl}/issues` },
      { label: m.contact_maintainerLabel(), href: SITE.author.url }
    ]
  }
}
