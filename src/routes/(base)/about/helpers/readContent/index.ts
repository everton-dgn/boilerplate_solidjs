import { m } from '@paraglide/messages.js'

import type { SitePage } from '@/@types/site-page.ts'
import { SITE_LINKS } from '@/constants/siteLinks/index.ts'

export function readContent(): SitePage {
  return {
    title: m.about_title(),
    description: m.about_description(),
    intro: m.about_intro(),
    sections: [
      {
        title: m.about_purposeTitle(),
        paragraphs: [m.about_purpose()]
      },
      {
        title: m.about_sourceTitle(),
        paragraphs: [m.about_source()]
      }
    ],
    links: [...SITE_LINKS.pages, ...SITE_LINKS.sources]
  }
}
