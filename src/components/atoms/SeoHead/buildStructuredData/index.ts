import type { Article, Graph, Organization, WebPage, WebSite } from 'schema-dts'

import type { SeoMetadata } from '@/@types/seo.ts'
import { SITE } from '@/constants/site.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { serializeJsonLd } from '@/helpers/serializeJsonLd/index.ts'

type BuildStructuredDataOptions = {
  seo: SeoMetadata
  // URL canônica absoluta da página.
  url: string
  // URL absoluta da imagem social.
  image: string
}

type SiteNode = Extract<WebSite, { '@type': 'WebSite' }>
type PageNode = Extract<WebPage | Article, { '@type': 'WebPage' | 'Article' }>
type OrganizationNode = Extract<Organization, { '@type': 'Organization' }>
type StructuredDataGraph = Omit<Graph, '@graph'> & {
  '@graph': readonly [SiteNode, PageNode, OrganizationNode]
}

// JSON-LD (schema.org) com o site, a página atual e a organização que os
// publica, serializado para o `<script>` do `SeoHead`. Nós próprios de uma
// página usam `createStructuredData`, em um script separado.
export function buildStructuredData({
  seo,
  url,
  image
}: BuildStructuredDataOptions): string {
  const siteId = resolveSiteUrl('/#website')
  const organizationId = resolveSiteUrl('/#organization')
  const pageBase = {
    '@id': url,
    url,
    name: seo.title,
    description: seo.description,
    inLanguage: SITE.locale,
    isPartOf: { '@id': siteId },
    // Dimensões ficam só no Open Graph: o schema-dts tipa `width` e `height`
    // como `Distance` ou `QuantitativeValue`, e o Google não as consome aqui.
    image: { '@type': 'ImageObject', url: image, caption: seo.image.alt }
  } satisfies Omit<PageNode, '@type'>
  const page: PageNode =
    seo.type === 'article'
      ? {
          '@type': 'Article',
          ...pageBase,
          headline: seo.title,
          author: {
            '@type': 'Person',
            name: SITE.author.name,
            url: SITE.author.url
          },
          publisher: { '@id': organizationId },
          ...seo.article
        }
      : { '@type': 'WebPage', ...pageBase }
  const graph: StructuredDataGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': siteId,
        url: resolveSiteUrl('/'),
        name: SITE.title,
        description: SITE.description,
        inLanguage: SITE.locale,
        publisher: { '@id': organizationId }
      },
      page,
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: SITE.title,
        url: resolveSiteUrl('/'),
        logo: { '@type': 'ImageObject', url: resolveSiteUrl(SITE.logo) },
        sameAs: SITE.socialLinks
      }
    ]
  }
  return serializeJsonLd(graph)
}
