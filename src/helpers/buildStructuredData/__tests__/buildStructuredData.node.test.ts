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

describe('dados estruturados da página', () => {
  it('descreve o site e a página como WebSite e WebPage', () => {
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
        inLanguage: 'pt-BR'
      },
      {
        '@type': 'WebPage',
        '@id': `${SITE.url}/guia`,
        url: `${SITE.url}/guia`,
        name: 'Guia público',
        description: 'Conteúdo público do guia.',
        inLanguage: 'pt-BR',
        isPartOf: { '@id': `${SITE.url}/#website` },
        image: {
          '@type': 'ImageObject',
          url: `${SITE.url}${SITE.image.path}`,
          width: SITE.image.width,
          height: SITE.image.height,
          caption: SITE.image.alt
        }
      }
    ])
  })

  it('publica artigos como Article com headline e autor', () => {
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
      name: SITE.author
    })
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
