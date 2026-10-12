import { m } from '@paraglide/messages.js'
import type { RouteDefinition } from '@solidjs/router'

import type { SitePage } from '@/@types/site-page.ts'
import { SiteArticle } from '@/components/organisms/SiteArticle/index.tsx'
import { readPageLinks } from '@/helpers/siteLinks/index.ts'

function readContent(): SitePage {
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
    links: readPageLinks()
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

export default function Privacy() {
  return <SiteArticle page={readContent()} />
}
