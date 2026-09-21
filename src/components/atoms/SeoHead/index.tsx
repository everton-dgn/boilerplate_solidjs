import { useLocation, useRouteMatches } from '@solidjs/router'
import { useHead } from '@solidjs/web'

import { SITE } from '@/constants/site.ts'
import { resolveRouteSeo } from '@/helpers/resolveRouteSeo/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'

export function SeoHead() {
  const location = useLocation()
  const matches = useRouteMatches()
  const seo = () =>
    resolveRouteSeo(matches().map(match => match.route.info?.seo))
  const canonical = () => resolveSiteUrl(location.pathname)
  const image = resolveSiteUrl(SITE.image.path)

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
    { tag: 'meta', props: { property: 'og:image', content: image } },
    {
      tag: 'meta',
      props: { property: 'og:image:width', content: String(SITE.image.width) }
    },
    {
      tag: 'meta',
      props: { property: 'og:image:height', content: String(SITE.image.height) }
    },
    {
      tag: 'meta',
      props: { property: 'og:image:alt', content: SITE.image.alt }
    },
    { tag: 'meta', props: { name: 'twitter:image', content: image } }
  ])

  return null
}
