import { getLocale, locales } from '@paraglide/runtime.js'
import { useLocation, useRouteMatches } from '@solidjs/router'
import { type HeadTag, useHead } from '@solidjs/web'
import type { Thing } from 'schema-dts'
import { type Accessor, createMemo, createUniqueId } from 'solid-js'

import { SITE } from '@/constants/site.ts'
import {
  hasMarkdownOptIn,
  markdownPath
} from '@/helpers/markdownRoute/index.ts'
import { resolveRouteSeo } from '@/helpers/resolveRouteSeo/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { buildLocaleAlternates } from '@/i18n/buildLocaleAlternates/index.ts'
import { LOCALE_TAGS } from '@/i18n/localeTags/index.ts'
import { localizeHref } from '@/i18n/urls/index.ts'

import { buildStructuredData } from './buildStructuredData/index.ts'

// `Thing` inclui enumerações como strings; aqui só entram nós de objeto.
type SchemaNode = Exclude<Thing, string>

type StructuredData = SchemaNode | readonly SchemaNode[]

// `Array.isArray` não estreita listas `readonly`; o guard explícito resolve.
function isNodeList(
  data: SchemaNode | readonly SchemaNode[]
): data is readonly SchemaNode[] {
  return Array.isArray(data)
}

function withContext(data: StructuredData): object {
  if (isNodeList(data)) {
    return { '@context': 'https://schema.org', '@graph': data }
  }
  // Evita distribuir o spread por todos os tipos de schema-dts.
  const node: object = data
  return { '@context': 'https://schema.org', ...node }
}

type CreateSeoOptions =
  | { route: true; structuredData?: never }
  | { route?: never; structuredData: Accessor<StructuredData | undefined> }

const ROBOTS_INDEX = 'index, follow, max-image-preview:large'
const ROBOTS_NOINDEX = 'noindex'

// Páginas noindex omitem canonical, redes sociais e o grafo base.
function publishRouteSeo(): void {
  const location = useLocation()
  const matches = useRouteMatches()
  const seo = createMemo(() =>
    resolveRouteSeo(matches().map(match => match.route.info?.seo))
  )
  const canonical = createMemo(() =>
    resolveSiteUrl(localizeHref({ href: location.pathname }))
  )
  const image = createMemo(() => resolveSiteUrl(seo().image.path))
  // Só `indexableTags` lê o link, e ela já exclui as páginas noindex.
  const markdownHref = createMemo(() =>
    hasMarkdownOptIn(matches().map(match => match.route.info))
      ? markdownPath(localizeHref({ href: location.pathname }))
      : undefined
  )
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

  const indexableTags = (): HeadTag[] => {
    const markdown = markdownHref()
    return [
      {
        tag: 'meta',
        props: {
          property: 'og:locale',
          content: SITE.locale.replaceAll('-', '_')
        }
      },
      ...locales
        .filter(locale => locale !== getLocale())
        .map(locale => ({
          tag: 'meta' as const,
          key: `og:locale:alternate:${locale}`,
          props: {
            property: 'og:locale:alternate',
            content: LOCALE_TAGS[locale].replaceAll('-', '_')
          }
        })),
      { tag: 'meta', props: { property: 'og:site_name', content: SITE.title } },
      {
        tag: 'meta',
        props: { name: 'twitter:card', content: 'summary_large_image' }
      },
      { tag: 'meta', props: { name: 'twitter:site', content: SITE.twitter } },
      {
        tag: 'meta',
        props: { name: 'twitter:creator', content: SITE.author.twitter }
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
      ...(markdown
        ? [
            {
              tag: 'link' as const,
              key: 'markdown-alternate',
              props: {
                rel: 'alternate',
                type: 'text/markdown',
                href: resolveSiteUrl(markdown)
              }
            }
          ]
        : []),
      ...buildLocaleAlternates({
        href: location.pathname,
        siteUrl: SITE.url
      }).map(({ hreflang, href }) => ({
        tag: 'link' as const,
        props: { rel: 'alternate', hreflang, href }
      })),
      { tag: 'meta', props: { property: 'og:url', content: canonical() } },
      { tag: 'meta', props: { property: 'og:image', content: image() } },
      {
        tag: 'meta',
        props: {
          property: 'og:image:width',
          content: String(seo().image.width)
        }
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
  }

  useHead(() =>
    seo().noindex ? baseTags() : [...baseTags(), ...indexableTags()]
  )
}

export function createSeo(options: CreateSeoOptions): void {
  if (options.route) {
    publishRouteSeo()
    return
  }

  const id = createUniqueId()

  useHead(() => {
    const nodes = options.structuredData()
    if (nodes === undefined) return []

    return {
      tag: 'script',
      key: `structured-data:${id}`,
      props: {
        type: 'application/ld+json',
        children: JSON.stringify(withContext(nodes))
      }
    }
  })
}
