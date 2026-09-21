import type {
  Article,
  Graph,
  ImageObject,
  Organization,
  WebPage,
  WebSite
} from 'schema-dts'

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

// O schema-dts tipa `width` e `height` como `Distance` ou `QuantitativeValue`;
// o Google documenta e aceita números, então só esses dois campos são relaxados.
type ImageNode = Omit<
  Extract<ImageObject, { '@type': 'ImageObject' }>,
  'width' | 'height'
> & { width: number; height: number }

// Distribui sobre a união para preservar o `@type` literal de cada nó.
type WithImageNode<T> = T extends { '@type': string }
  ? Omit<T, 'image' | 'logo'> & { image?: ImageNode; logo?: ImageNode }
  : never

type SiteNode = Extract<WebSite, { '@type': 'WebSite' }>
type PageNode = WithImageNode<
  Extract<WebPage | Article, { '@type': 'WebPage' | 'Article' }>
>
type OrganizationNode = WithImageNode<
  Extract<Organization, { '@type': 'Organization' }>
>
type StructuredDataGraph = Omit<Graph, '@graph'> & {
  '@graph': readonly [SiteNode, PageNode, OrganizationNode]
}

// JSON-LD (schema.org) com o site, a página atual e a organização que os
// publica, serializado para o `<script>` do `SeoHead`. Nós próprios de uma
// página vão no atom `StructuredData`, em um script separado.
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
    image: {
      '@type': 'ImageObject',
      url: image,
      width: seo.image.width,
      height: seo.image.height,
      caption: seo.image.alt
    }
  } satisfies Omit<PageNode, '@type'>
  const page: PageNode =
    seo.type === 'article'
      ? {
          '@type': 'Article',
          ...pageBase,
          headline: seo.title,
          author: { '@type': 'Person', name: SITE.author },
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
        logo: {
          '@type': 'ImageObject',
          url: resolveSiteUrl(SITE.logo.path),
          width: SITE.logo.width,
          height: SITE.logo.height
        },
        sameAs: SITE.socialLinks
      }
    ]
  }
  return serializeJsonLd(graph)
}
