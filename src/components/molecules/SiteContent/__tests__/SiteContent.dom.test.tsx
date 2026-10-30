import type { SitePage } from '@/@types/site-page.ts'
import { SITE } from '@/constants/site/index.ts'
import { SITE_LINKS } from '@/constants/siteLinks/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { SiteContent } from '../index.tsx'

describe('conteúdo das páginas institucionais', () => {
  it('localiza os links internos uma vez e preserva os externos', () => {
    const page: SitePage = {
      title: 'Título',
      description: 'Descrição',
      intro: 'Introdução',
      sections: [],
      links: [...SITE_LINKS.pages, ...SITE_LINKS.sources]
    }
    const host = renderComponent(() => <SiteContent page={page} />, {
      providers: false
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
