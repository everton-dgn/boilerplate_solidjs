import { m } from '@paraglide/messages.js'

import type { SitePage } from '@/@types/site-page.ts'
import { SITE_LINKS } from '@/constants/siteLinks/index.ts'

export function readContent(): SitePage {
  return {
    title: m.privacy_title(),
    description: m.privacy_description(),
    intro: m.privacy_intro(),
    sections: [
      {
        title: m.privacy_preferencesTitle(),
        paragraphs: [m.privacy_preferences()]
      },
      {
        title: m.privacy_hostingTitle(),
        paragraphs: [m.privacy_hosting()]
      },
      {
        title: m.privacy_questionsTitle(),
        paragraphs: [m.privacy_questions()]
      }
    ],
    links: SITE_LINKS.pages
  }
}
