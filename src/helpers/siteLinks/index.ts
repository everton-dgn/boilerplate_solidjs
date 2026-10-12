import { m } from '@paraglide/messages.js'

import type { SiteLink } from '@/@types/site-page.ts'
import { SITE } from '@/constants/site.ts'
import { localizeHref } from '@/i18n/urls/index.ts'

export function readPageLinks(): SiteLink[] {
  return [
    { label: m.siteLinks_homeLabel(), href: localizeHref({ href: '/' }) },
    {
      label: m.siteLinks_aboutLabel(),
      href: localizeHref({ href: '/about' })
    },
    {
      label: m.siteLinks_contactLabel(),
      href: localizeHref({ href: '/contact' })
    },
    {
      label: m.siteLinks_privacyLabel(),
      href: localizeHref({ href: '/privacy' })
    }
  ]
}

export function readSourceLinks(): SiteLink[] {
  return [
    { label: m.siteLinks_repositoryLabel(), href: SITE.repositoryUrl },
    {
      label: m.siteLinks_documentationLabel(),
      href: `${SITE.repositoryUrl}#readme`
    }
  ]
}
