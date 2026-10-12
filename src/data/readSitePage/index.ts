import { m } from '@paraglide/messages.js'

import { SITE } from '@/constants/site.ts'
import { localizeHref } from '@/i18n/urls/index.ts'

import type { SiteLink, SitePage } from './types.ts'

type SitePagePath = '/' | '/about' | '/contact' | '/privacy'

const REPOSITORY_URL = 'https://github.com/everton-dgn/boilerplate_solidjs'

function pageLinks(): SiteLink[] {
  return [
    { label: m.readSitePage_homeLabel(), href: localizeHref({ href: '/' }) },
    {
      label: m.readSitePage_aboutLabel(),
      href: localizeHref({ href: '/about' })
    },
    {
      label: m.readSitePage_contactLabel(),
      href: localizeHref({ href: '/contact' })
    },
    {
      label: m.readSitePage_privacyLabel(),
      href: localizeHref({ href: '/privacy' })
    }
  ]
}

function sourceLinks(): SiteLink[] {
  return [
    { label: m.readSitePage_repositoryLabel(), href: REPOSITORY_URL },
    {
      label: m.readSitePage_documentationLabel(),
      href: `${REPOSITORY_URL}#readme`
    }
  ]
}

function readHome(): SitePage {
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
    links: [...pageLinks(), ...sourceLinks()]
  }
}

function readAbout(): SitePage {
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
    links: [...pageLinks(), ...sourceLinks()]
  }
}

function readContact(): SitePage {
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
      ...pageLinks(),
      { label: m.contact_issuesLabel(), href: `${REPOSITORY_URL}/issues` },
      { label: m.contact_maintainerLabel(), href: SITE.author.url }
    ]
  }
}

function readPrivacy(): SitePage {
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
    links: pageLinks()
  }
}

const READERS = new Map<string, () => SitePage>([
  ['/', readHome],
  ['/about', readAbout],
  ['/contact', readContact],
  ['/privacy', readPrivacy]
])

export function readSitePage(pathname: SitePagePath): SitePage
export function readSitePage(pathname: string): SitePage | undefined
export function readSitePage(pathname: string): SitePage | undefined {
  return READERS.get(pathname)?.()
}
