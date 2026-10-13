import { m } from '@paraglide/messages.js'

import type { SeoRouteInfo } from '@/@types/seo.ts'
import type { SitePage } from '@/@types/site-page.ts'
import { SITE } from '@/constants/site.ts'
import { SITE_LINKS } from '@/constants/siteLinks/index.ts'

export const content = {
  get title() {
    return m.home_title()
  },
  get description() {
    return SITE.description
  },
  get intro() {
    return m.home_description({
      framework: 'SolidJS 2',
      toolchain: 'Vite+',
      language: 'TypeScript'
    })
  },
  get sections() {
    return [
      {
        title: m.home_featuresTitle(),
        paragraphs: [m.home_features()]
      },
      {
        title: m.home_usageTitle(),
        paragraphs: [m.home_usage()]
      }
    ]
  },
  get links() {
    return [...SITE_LINKS.pages, ...SITE_LINKS.sources]
  }
} satisfies SitePage

export const seo = {
  get title() {
    return m.home_seoTitle()
  }
} satisfies SeoRouteInfo
