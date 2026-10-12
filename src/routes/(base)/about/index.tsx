import { m } from '@paraglide/messages.js'
import type { RouteDefinition } from '@solidjs/router'

import type { SitePage } from '@/@types/site-page.ts'
import { SiteArticle } from '@/components/organisms/SiteArticle/index.tsx'
import { readPageLinks, readSourceLinks } from '@/helpers/siteLinks/index.ts'

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
    links: [...readPageLinks(), ...readSourceLinks()]
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
