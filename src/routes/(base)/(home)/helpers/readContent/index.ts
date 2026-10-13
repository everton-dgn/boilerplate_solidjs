import { m } from '@paraglide/messages.js'

import type { SitePage } from '@/@types/site-page.ts'
import { SITE } from '@/constants/site.ts'
import { SITE_LINKS } from '@/constants/siteLinks/index.ts'

export function readContent(): SitePage {
  return {
    title: m.home_title(),
    description: SITE.description,
    intro: m.home_description({
      framework: 'SolidJS 2',
      toolchain: 'Vite+',
      language: 'TypeScript'
    }),
    sections: [
      {
        title: m.home_featuresTitle(),
        paragraphs: [m.home_features()]
      },
      {
        title: m.home_usageTitle(),
        paragraphs: [m.home_usage()]
      }
    ],
    links: [...SITE_LINKS.pages, ...SITE_LINKS.sources]
  }
}
