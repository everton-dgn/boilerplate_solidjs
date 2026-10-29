import { m } from '@paraglide/messages.js'

import type { SiteLink } from '@/@types/site-page.ts'
import { SITE } from '@/constants/site.ts'

// Caminhos sem idioma: o LocalizedLink de cada consumidor aplica o prefixo.
export const SITE_LINKS = {
  get pages(): SiteLink[] {
    return [
      { label: m.siteLinks_homeLabel(), href: '/' },
      { label: m.siteLinks_aboutLabel(), href: '/about' },
      { label: m.siteLinks_contactLabel(), href: '/contact' },
      { label: m.siteLinks_privacyLabel(), href: '/privacy' }
    ]
  },
  get sources(): SiteLink[] {
    return [
      { label: m.siteLinks_repositoryLabel(), href: SITE.repositoryUrl },
      {
        label: m.siteLinks_documentationLabel(),
        href: `${SITE.repositoryUrl}#readme`
      }
    ]
  }
}
