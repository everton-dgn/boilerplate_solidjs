import type { SeoMetadata } from '@/@types/seo.ts'
import { SITE } from '@/constants/site.ts'
import { parseStructuredData } from '@/tests/helpers/parseStructuredData/index.ts'

import { buildStructuredData } from '../index.ts'

const page: SeoMetadata = {
  title: 'Guia público',
  description: 'Conteúdo público do guia.',
  noindex: false,
  type: 'website',
  image: SITE.image
}

const organization = {
  '@type': 'Organization',
  '@id': `${SITE.url}/#organization`,
  name: SITE.title,
  url: `${SITE.url}/`,
  logo: { '@type': 'ImageObject', url: `${SITE.url}${SITE.logo}` },
  sameAs: SITE.socialLinks
}

describe('dados estruturados da página', () => {
  it('descreve o site, a página e a organização que os publica', () => {
    const graph = parseStructuredData(
      buildStructuredData({
        seo: page,
        url: `${SITE.url}/guia`,
        image: `${SITE.url}${SITE.image.path}`
      })
    )

    expect(graph['@context']).toBe('https://schema.org')
    expect(graph['@graph']).toStrictEqual([
      {
        '@type': 'WebSite',
        '@id': `${SITE.url}/#website`,
        url: `${SITE.url}/`,
        name: SITE.title,
        description: SITE.description,
        inLanguage: SITE.locale,
        publisher: { '@id': `${SITE.url}/#organization` }
      },
      {
        '@type': 'WebPage',
        '@id': `${SITE.url}/guia`,
        url: `${SITE.url}/guia`,
        name: 'Guia público',
        description: 'Conteúdo público do guia.',
        inLanguage: SITE.locale,
        isPartOf: { '@id': `${SITE.url}/#website` },
        image: {
          '@type': 'ImageObject',
          url: `${SITE.url}${SITE.image.path}`,
          caption: SITE.image.alt
        }
      },
      organization
    ])
  })

  it('publica artigos como Article com headline, autor e publisher', () => {
    const graph = parseStructuredData(
      buildStructuredData({
        seo: { ...page, type: 'article', title: 'Artigo' },
        url: `${SITE.url}/artigo`,
        image: `${SITE.url}/images/artigo.png`
      })
    )
    const [, article] = graph['@graph']

    expect(article?.['@type']).toBe('Article')
    expect(article?.headline).toBe('Artigo')
    expect(article?.author).toStrictEqual({
      '@type': 'Person',
      name: SITE.author.name,
      url: SITE.author.url,
      sameAs: SITE.author.sameAs
    })
    expect(article?.publisher).toStrictEqual({
      '@id': `${SITE.url}/#organization`
    })
    expect('datePublished' in (article ?? {})).toBe(false)
  })

  it('publica as datas do artigo quando a rota as declara', () => {
    const graph = parseStructuredData(
      buildStructuredData({
        seo: {
          ...page,
          type: 'article',
          article: { datePublished: '2026-09-01', dateModified: '2026-09-21' }
        },
        url: `${SITE.url}/artigo`,
        image: `${SITE.url}/images/artigo.png`
      })
    )
    const [, article] = graph['@graph']

    expect(article).toMatchObject({
      '@type': 'Article',
      datePublished: '2026-09-01',
      dateModified: '2026-09-21'
    })
  })

  it('ignora as datas de artigo em página que não é artigo', () => {
    const graph = parseStructuredData(
      buildStructuredData({
        seo: { ...page, article: { datePublished: '2026-09-01' } },
        url: `${SITE.url}/guia`,
        image: `${SITE.url}${SITE.image.path}`
      })
    )

    expect('datePublished' in (graph['@graph'][1] ?? {})).toBe(false)
  })

  it('escapa HTML para não encerrar o script que envolve o JSON', () => {
    const json = buildStructuredData({
      seo: { ...page, description: '</script><b>&</b>' },
      url: `${SITE.url}/`,
      image: `${SITE.url}${SITE.image.path}`
    })

    expect(json).not.toContain('<')
    expect(json).not.toContain('>')
    expect(json).not.toContain('&')
    expect(parseStructuredData(json)['@graph'][1]?.description).toBe(
      '</script><b>&</b>'
    )
  })
})
