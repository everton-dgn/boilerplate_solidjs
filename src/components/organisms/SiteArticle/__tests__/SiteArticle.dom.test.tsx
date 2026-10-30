import type { SitePage } from '@/@types/site-page.ts'
import { SITE } from '@/constants/site.ts'
import { SITE_LINKS } from '@/constants/siteLinks/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { SiteArticle } from '../index.tsx'

describe('conteúdo das páginas institucionais', () => {
  it('localiza os links internos uma vez e preserva os externos', () => {
    const page: SitePage = {
      title: 'Título',
      intro: 'Introdução',
      sections: [],
      links: [...SITE_LINKS.pages, ...SITE_LINKS.sources]
    }
    const host = renderComponent(() => <SiteArticle page={page} />, {
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
