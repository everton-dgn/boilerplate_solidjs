import { m } from '@paraglide/messages.js'

import { SITE } from '@/constants/site.ts'
import { localizeHref } from '@/i18n/urls/index.ts'

import type { SiteLink, SitePage } from './types.ts'

type SitePagePath = '/' | '/about' | '/contact' | '/privacy'

const REPOSITORY_URL = 'https://github.com/everton-dgn/boilerplate_solidjs'

function pageLinks(): SiteLink[] {
  return [
    { label: m.siteContent_homeLabel(), href: localizeHref({ href: '/' }) },
    {
      label: m.siteContent_aboutLabel(),
      href: localizeHref({ href: '/about' })
    },
    {
      label: m.siteContent_contactLabel(),
      href: localizeHref({ href: '/contact' })
    },
    {
      label: m.siteContent_privacyLabel(),
      href: localizeHref({ href: '/privacy' })
    }
  ]
}

function sourceLinks(): SiteLink[] {
  return [
    { label: m.siteContent_repositoryLabel(), href: REPOSITORY_URL },
    {
      label: m.siteContent_documentationLabel(),
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
        title: m.siteContent_homeFeaturesTitle(),
        paragraphs: [m.siteContent_homeFeatures()]
      },
      {
        title: m.siteContent_homeUsageTitle(),
        paragraphs: [m.siteContent_homeUsage()]
      }
    ],
    links: [...pageLinks(), ...sourceLinks()]
  }
}

function readAbout(): SitePage {
  return {
    title: m.siteContent_aboutTitle(),
    description: m.siteContent_aboutDescription(),
    intro: m.siteContent_aboutIntro(),
    sections: [
      {
        title: m.siteContent_aboutPurposeTitle(),
        paragraphs: [m.siteContent_aboutPurpose()]
      },
      {
        title: m.siteContent_aboutSourceTitle(),
        paragraphs: [m.siteContent_aboutSource()]
      }
    ],
    links: [...pageLinks(), ...sourceLinks()]
  }
}

function readContact(): SitePage {
  return {
    title: m.siteContent_contactTitle(),
    description: m.siteContent_contactDescription(),
    intro: m.siteContent_contactIntro(),
    sections: [
      {
        title: m.siteContent_contactIssuesTitle(),
        paragraphs: [m.siteContent_contactIssues()]
      },
      {
        title: m.siteContent_contactMaintainerTitle(),
        paragraphs: [m.siteContent_contactMaintainer()]
      }
    ],
    links: [
      ...pageLinks(),
      { label: m.siteContent_issuesLabel(), href: `${REPOSITORY_URL}/issues` },
      { label: m.siteContent_maintainerLabel(), href: SITE.author.url }
    ]
  }
}

function readPrivacy(): SitePage {
  return {
    title: m.siteContent_privacyTitle(),
    description: m.siteContent_privacyDescription(),
    intro: m.siteContent_privacyIntro(),
    sections: [
      {
        title: m.siteContent_privacyPreferencesTitle(),
        paragraphs: [m.siteContent_privacyPreferences()]
      },
      {
        title: m.siteContent_privacyHostingTitle(),
        paragraphs: [m.siteContent_privacyHosting()]
      },
      {
        title: m.siteContent_privacyQuestionsTitle(),
        paragraphs: [m.siteContent_privacyQuestions()]
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
