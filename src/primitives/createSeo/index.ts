import { useLocation, useRouteMatches } from '@solidjs/router'
import { type HeadTag, useHead } from '@solidjs/web'
import type { Thing } from 'schema-dts'
import { type Accessor, createUniqueId } from 'solid-js'

import { SITE } from '@/constants/site.ts'
import { resolveRouteSeo } from '@/helpers/resolveRouteSeo/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { serializeJsonLd } from '@/helpers/serializeJsonLd/index.ts'

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

// `index, follow` já é o padrão do crawler; o ganho está em
// `max-image-preview:large`, que libera a prévia grande da imagem.
const ROBOTS_INDEX = 'index, follow, max-image-preview:large'
const ROBOTS_NOINDEX = 'noindex'

// Escolha do projeto: página `noindex` publica só `robots`, título e
// descrição. Canonical, Open Graph, Twitter e o grafo base ficam restritos às
// páginas indexáveis, inclusive as tags que não variam por rota.
function publishRouteSeo(): void {
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
}

// O modo de rota registra o SEO global uma vez na raiz do Router.
// Dados próprios pertencem ao owner da chamada, inclusive em rota noindex.
// Retornar undefined suspende somente o script desta instância.
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
        children: serializeJsonLd(withContext(nodes))
      }
    }
  })
}
