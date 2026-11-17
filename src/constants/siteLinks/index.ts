import { m } from '@paraglide/messages.js'

import type { SiteLink } from '@/@types/site-page.ts'
import { SITE } from '@/constants/site/index.ts'

// Paths without a locale: the LocalizedLink of each consumer applies the prefix.
export const SITE_LINKS = {
  get pages(): SiteLink[] {
    return [
      { label: m.siteLinks_homeLabel(), href: '/' },
      { label: m.siteLinks_aboutLabel(), href: '/about' },
      { label: m.siteLinks_contactLabel(), href: '/contact' },
      { label: m.siteLinks_privacyLabel(), href: '/privacy' }
    ]
  },
  get repository(): SiteLink {
    return { label: m.siteLinks_repositoryLabel(), href: SITE.repositoryUrl }
  }
}
