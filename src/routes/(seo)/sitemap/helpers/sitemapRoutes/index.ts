import type { APIEvent } from 'filesystem-routing/api'

import type { SitemapPartitionSource } from '@/@types/sitemap.ts'
import { HTTP_NOT_FOUND } from '@/constants/http.ts'
import { readPublicationPhase } from '@/helpers/readPublicationPhase/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'

import { readSitemapContext } from '../readSitemapContext/index.ts'
import { errorResponse } from '../sitemapService/helpers/sitemapResponse/index.ts'
import {
  buildSitemapIndexResponse,
  buildSitemapInventoryResponse,
  buildSitemapPartResponse
} from '../sitemapService/index.ts'
import type { ServiceOptions } from '../sitemapService/types.ts'

type Sources = readonly SitemapPartitionSource[]
type SitemapRoute = (event: APIEvent) => Promise<Response>
type SettingsOptions = { sources: Sources; request: Request }
type XmlSegments = { part: string; source: string }

const XML_SUFFIX = '.xml'
const SOURCE_SEGMENT_FROM_END = -2

function serviceOptions({ sources, request }: SettingsOptions): ServiceOptions {
  return {
    ...readSitemapContext(),
    sources,
    siteUrl: resolveSiteUrl('/'),
    signal: request.signal,
    method: request.method
  }
}

// O roteador casa `/sitemaps/pages/1` no mesmo padrão de `1.xml`; sem o sufixo
// a parte não existe, e a recusa vem antes de ler o estado do sitemap.
function readXmlSegments(request: Request): XmlSegments | undefined {
  const segments = new URL(request.url).pathname.split('/')
  const segment = segments.at(-1) ?? ''
  if (!segment.endsWith(XML_SUFFIX)) return undefined
  return {
    part: segment.slice(0, -XML_SUFFIX.length),
    source: segments.at(SOURCE_SEGMENT_FROM_END) ?? ''
  }
}

function notFound(): Promise<Response> {
  return Promise.resolve(errorResponse(HTTP_NOT_FOUND))
}

export function createIndexRoute(sources: Sources): SitemapRoute {
  return ({ request }) =>
    buildSitemapIndexResponse(serviceOptions({ sources, request }))
}

export function createPagePartRoute(sources: Sources): SitemapRoute {
  return ({ request }) => {
    const segments = readXmlSegments(request)
    if (!segments) return notFound()
    return buildSitemapPartResponse({
      ...serviceOptions({ sources, request }),
      kind: 'pages',
      part: segments.part
    })
  }
}

export function createSourcePartRoute(sources: Sources): SitemapRoute {
  return ({ request }) => {
    const segments = readXmlSegments(request)
    if (!segments) return notFound()
    return buildSitemapPartResponse({
      ...serviceOptions({ sources, request }),
      kind: 'source',
      ...segments
    })
  }
}

export function createArrayPartRoute(sources: Sources): SitemapRoute {
  return ({ request }) =>
    buildSitemapPartResponse({
      ...serviceOptions({ sources, request }),
      kind: 'array',
      part: 'array'
    })
}

// Só existe no prerender: fora dele, nenhuma requisição recompõe o inventário.
export function createInventoryRoute(
  sources: Sources
): () => Promise<Response> {
  return () => {
    if (readPublicationPhase() !== 'prerender') return notFound()
    return buildSitemapInventoryResponse({
      ...readSitemapContext(),
      sources,
      siteUrl: resolveSiteUrl('/')
    })
  }
}
