import { useLocation, useRouteMatches } from '@solidjs/router'
import { useHead } from '@solidjs/web'

import { buildStructuredData } from '@/helpers/buildStructuredData/index.ts'
import { resolveRouteSeo } from '@/helpers/resolveRouteSeo/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'

export function SeoHead() {
  const location = useLocation()
  const matches = useRouteMatches()
  const seo = () =>
    resolveRouteSeo(matches().map(match => match.route.info?.seo))
  const canonical = () => resolveSiteUrl(location.pathname)
  const image = () => resolveSiteUrl(seo().image.path)
  const structuredData = () =>
    buildStructuredData({ seo: seo(), url: canonical(), image: image() })

  useHead(() => [
    ...(seo().noindex
      ? [
          {
            tag: 'meta' as const,
            props: { name: 'robots', content: 'noindex' }
          }
        ]
      : []),
    { tag: 'title', props: { children: seo().title } },
    { tag: 'meta', props: { name: 'description', content: seo().description } },
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
    {
      tag: 'script',
      key: 'structured-data',
      props: { type: 'application/ld+json', children: structuredData() }
    }
  ])

  return null
}
