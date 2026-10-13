import { m } from '@paraglide/messages.js'

import type { SeoRouteInfo } from '@/@types/seo.ts'
import type { SitePage } from '@/@types/site-page.ts'
import { SITE_LINKS } from '@/constants/siteLinks/index.ts'

export const content = {
  get title() {
    return m.privacy_title()
  },
  get description() {
    return m.privacy_description()
  },
  get intro() {
    return m.privacy_intro()
  },
  get sections() {
    return [
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
    ]
  },
  get links() {
    return SITE_LINKS.pages
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
