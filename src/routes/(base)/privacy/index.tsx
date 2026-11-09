import { m } from '@paraglide/messages.js'
import type { RouteDefinition } from '@solidjs/router'

import type { SitePage } from '@/@types/site-page.ts'
import { SiteArticle } from '@/components/organisms/SiteArticle/index.tsx'
import { SITE_LINKS } from '@/constants/siteLinks/index.ts'

import { seo } from './seo.ts'

const content = {
  get title() {
    return m.privacy_title()
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
      }
    ]
  },
  get links() {
    return SITE_LINKS.pages
  }
} satisfies SitePage

export const route = {
  info: {
    llms: true,
    markdown: true,
    seo
  }
} satisfies RouteDefinition

export default function Privacy() {
  return <SiteArticle page={content} />
}
