import { m } from '@paraglide/messages.js'
import type { RouteDefinition } from '@solidjs/router'

import type { SitePage } from '@/@types/site-page.ts'
import { SiteArticle } from '@/components/organisms/SiteArticle/index.tsx'
import { SITE_LINKS } from '@/constants/siteLinks/index.ts'

function readContent(): SitePage {
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

export const route = {
  info: {
    llms: true,
    content: readContent,
    seo: {
      get title() {
        return readContent().title
      },
      get description() {
        return readContent().description
      }
    }
  }
} satisfies RouteDefinition

export default function About() {
  return <SiteArticle page={readContent()} />
}
