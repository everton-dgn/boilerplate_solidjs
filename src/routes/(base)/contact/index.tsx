import { m } from '@paraglide/messages.js'
import type { RouteDefinition } from '@solidjs/router'

import type { SitePage } from '@/@types/site-page.ts'
import { SiteArticle } from '@/components/organisms/SiteArticle/index.tsx'
import { SITE } from '@/constants/site.ts'
import { readPageLinks } from '@/helpers/siteLinks/index.ts'

function readContent(): SitePage {
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
      ...readPageLinks(),
      { label: m.contact_issuesLabel(), href: `${SITE.repositoryUrl}/issues` },
      { label: m.contact_maintainerLabel(), href: SITE.author.url }
    ]
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

export default function Contact() {
  return <SiteArticle page={readContent()} />
}
