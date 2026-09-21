import { useLocation, useRouteMatches } from '@solidjs/router'
import { type HeadTag, useHead } from '@solidjs/web'

import { SITE } from '@/constants/site.ts'
import { buildStructuredData } from '@/helpers/buildStructuredData/index.ts'
import { resolveRouteSeo } from '@/helpers/resolveRouteSeo/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'

// `index, follow` já é o padrão do crawler; o ganho está em
// `max-image-preview:large`, que libera a prévia grande da imagem.
const ROBOTS_INDEX = 'index, follow, max-image-preview:large'
const ROBOTS_NOINDEX = 'noindex'

// Escolha do projeto: página `noindex` publica só `robots`, título e
// descrição. Canonical, Open Graph, Twitter e JSON-LD ficam restritos às
// páginas indexáveis, inclusive as tags que não variam por rota.
export function SeoHead() {
  const location = useLocation()
  const matches = useRouteMatches()
  const seo = () =>
    resolveRouteSeo(matches().map(match => match.route.info?.seo))
  const canonical = () => resolveSiteUrl(location.pathname)
  const image = () => resolveSiteUrl(seo().image.path)
  const structuredData = () =>
    buildStructuredData({ seo: seo(), url: canonical(), image: image() })

  const baseTags = (): HeadTag[] => [
    {
      tag: 'meta',
      props: {
        name: 'robots',
        content: seo().noindex ? ROBOTS_NOINDEX : ROBOTS_INDEX
      }
    },
    { tag: 'title', props: { children: seo().title } },
    { tag: 'meta', props: { name: 'description', content: seo().description } }
  ]

  // Datas do artigo no Open Graph, só as que a rota declara.
  const articleTags = (): HeadTag[] => {
    if (seo().type !== 'article') return []
    const tags: HeadTag[] = []
    const { datePublished, dateModified } = seo().article ?? {}
    if (datePublished) {
      tags.push({
        tag: 'meta',
        props: { property: 'article:published_time', content: datePublished }
      })
    }
    if (dateModified) {
      tags.push({
        tag: 'meta',
        props: { property: 'article:modified_time', content: dateModified }
      })
    }
    return tags
  }

  const indexableTags = (): HeadTag[] => [
    {
      tag: 'meta',
      props: {
        property: 'og:locale',
        content: SITE.locale.replaceAll('-', '_')
      }
    },
    { tag: 'meta', props: { property: 'og:site_name', content: SITE.title } },
    {
      tag: 'meta',
      props: { name: 'twitter:card', content: 'summary_large_image' }
    },
    { tag: 'meta', props: { property: 'og:type', content: seo().type } },
    { tag: 'meta', props: { property: 'og:title', content: seo().title } },
    {
      tag: 'meta',
      props: { property: 'og:description', content: seo().description }
    },
    { tag: 'meta', props: { name: 'twitter:title', content: seo().title } },
    {
      tag: 'meta',
      props: { name: 'twitter:description', content: seo().description }
    },
    { tag: 'link', props: { rel: 'canonical', href: canonical() } },
    { tag: 'meta', props: { property: 'og:url', content: canonical() } },
    { tag: 'meta', props: { property: 'og:image', content: image() } },
    {
      tag: 'meta',
      props: { property: 'og:image:width', content: String(seo().image.width) }
    },
    {
      tag: 'meta',
      props: {
        property: 'og:image:height',
        content: String(seo().image.height)
      }
    },
    {
      tag: 'meta',
      props: { property: 'og:image:alt', content: seo().image.alt }
    },
    { tag: 'meta', props: { name: 'twitter:image', content: image() } },
    {
      tag: 'meta',
      props: { name: 'twitter:image:alt', content: seo().image.alt }
    },
    ...articleTags(),
    {
      tag: 'script',
      key: 'structured-data',
      props: { type: 'application/ld+json', children: structuredData() }
    }
  ]

  useHead(() =>
    seo().noindex ? baseTags() : [...baseTags(), ...indexableTags()]
  )

  return null
}
