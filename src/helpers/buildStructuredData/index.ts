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

// JSON-LD (schema.org) com o site e a página atual, serializado para o
// `<script>` do `SeoHead`. Nós próprios de uma página vão no atom
// `StructuredData`, em um script separado.
export function buildStructuredData({
  seo,
  url,
  image
}: BuildStructuredDataOptions): string {
  const siteId = resolveSiteUrl('/#website')
  const page = {
    '@type': seo.type === 'article' ? 'Article' : 'WebPage',
    '@id': url,
    url,
    name: seo.title,
    ...(seo.type === 'article' ? { headline: seo.title } : {}),
    description: seo.description,
    inLanguage: SITE.locale,
    isPartOf: { '@id': siteId },
    image: {
      '@type': 'ImageObject',
      url: image,
      width: seo.image.width,
      height: seo.image.height,
      caption: seo.image.alt
    },
    ...(seo.type === 'article'
      ? { author: { '@type': 'Person', name: SITE.author }, ...seo.article }
      : {})
  }
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': siteId,
        url: resolveSiteUrl('/'),
        name: SITE.title,
        description: SITE.description,
        inLanguage: SITE.locale
      },
      page
    ]
  }
  return serializeJsonLd(graph)
}
