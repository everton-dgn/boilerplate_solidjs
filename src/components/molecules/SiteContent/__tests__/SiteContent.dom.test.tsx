import type { SitePage } from '@/@types/site-page.ts'
import { SITE } from '@/constants/site/index.ts'
import { SITE_LINKS } from '@/constants/siteLinks/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { SiteContent } from '../index.tsx'

describe('content of the institutional pages', () => {
  it('localizes the internal links once and keeps the external ones', () => {
    const page: SitePage = {
      title: 'Title',
      intro: 'Introduction',
      sections: [],
      links: [
        ...SITE_LINKS.pages,
        { label: 'Repository', href: SITE.repositoryUrl },
        { label: 'Documentation', href: `${SITE.repositoryUrl}#readme` }
      ]
    }
    const host = renderComponent(() => <SiteContent page={page} />, {
      hasProviders: false
    })
    expect(
      Array.from(host.querySelectorAll('nav a'), link =>
        link.getAttribute('href')
      )
    ).toStrictEqual([
      '/en',
      '/en/about',
      '/en/contact',
      '/en/privacy',
      SITE.repositoryUrl,
      `${SITE.repositoryUrl}#readme`
    ])
  })
})
