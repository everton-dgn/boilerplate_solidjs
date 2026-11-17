import type { SeoMetadata } from '@/@types/seo.ts'
import { SITE } from '@/constants/site/index.ts'
import { parseStructuredData } from '@/tests/helpers/parseStructuredData/index.ts'

import { buildStructuredData } from '../index.ts'

const page: SeoMetadata = {
  title: 'Public guide',
  description: 'Public content of the guide.',
  noindex: false,
  type: 'website',
  image: SITE.image
}

const organizationWithoutContact = {
  '@type': 'Organization',
  '@id': `${SITE.url}/#organization`,
  name: SITE.title,
  description: SITE.description,
  url: `${SITE.url}/`,
  logo: { '@type': 'ImageObject', url: `${SITE.url}${SITE.logo}` },
  sameAs: SITE.socialLinks
}

const organization = {
  ...organizationWithoutContact,
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'demo',
    email: 'contato@example.com',
    telephone: '0000000000',
    description:
      'Placeholder values for this boilerplate demonstration. Do not use them to contact the maintainer.'
  },
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Rua de exemplo, 123',
    addressLocality: 'Cidade de exemplo',
    addressRegion: 'Estado de exemplo',
    postalCode: '00000-000',
    addressCountry: 'BR',
    description: 'Placeholder address for this boilerplate demonstration.'
  }
}

describe('structured data of the page', () => {
  it('describes the site, the page and the organization that publishes them', () => {
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
        inLanguage: ['pt-BR', 'en-US', 'es-ES'],
        publisher: { '@id': `${SITE.url}/#organization` }
      },
      {
        '@type': 'WebPage',
        '@id': `${SITE.url}/guia`,
        url: `${SITE.url}/guia`,
        name: 'Public guide',
        description: 'Public content of the guide.',
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

  it('leaves out the contact and the address that the site configuration does not define', () => {
    const { organization: configured } = SITE
    SITE.organization = {}
    try {
      const graph = parseStructuredData(
        buildStructuredData({
          seo: page,
          url: `${SITE.url}/guia`,
          image: `${SITE.url}${SITE.image.path}`
        })
      )

      expect(graph['@graph'][2]).toStrictEqual(organizationWithoutContact)
    } finally {
      SITE.organization = configured
    }
  })

  it('publishes articles as Article with headline, author and publisher', () => {
    const graph = parseStructuredData(
      buildStructuredData({
        seo: { ...page, type: 'article', title: 'Article' },
        url: `${SITE.url}/article`,
        image: `${SITE.url}/images/article.png`
      })
    )
    const [, article] = graph['@graph']

    expect(article?.['@type']).toBe('Article')
    expect(article?.headline).toBe('Article')
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

  it('publishes the article dates when the route declares them', () => {
    const graph = parseStructuredData(
      buildStructuredData({
        seo: {
          ...page,
          type: 'article',
          article: { datePublished: '2026-09-01', dateModified: '2026-09-21' }
        },
        url: `${SITE.url}/article`,
        image: `${SITE.url}/images/article.png`
      })
    )
    const [, article] = graph['@graph']

    expect(article).toMatchObject({
      '@type': 'Article',
      datePublished: '2026-09-01',
      dateModified: '2026-09-21'
    })
  })

  it('ignores the article dates on a page that is not an article', () => {
    const graph = parseStructuredData(
      buildStructuredData({
        seo: { ...page, article: { datePublished: '2026-09-01' } },
        url: `${SITE.url}/guia`,
        image: `${SITE.url}${SITE.image.path}`
      })
    )

    expect('datePublished' in (graph['@graph'][1] ?? {})).toBe(false)
  })

  it('keeps HTML characters in the description serialized as JSON', () => {
    const json = buildStructuredData({
      seo: { ...page, description: '</script><b>&</b>' },
      url: `${SITE.url}/`,
      image: `${SITE.url}${SITE.image.path}`
    })

    expect(parseStructuredData(json)['@graph'][1]?.description).toBe(
      '</script><b>&</b>'
    )
  })
})
