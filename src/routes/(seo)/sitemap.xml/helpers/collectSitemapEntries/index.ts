import type { SeoRouteInfo } from '@/@types/seo.ts'
import type { SitemapEntry, SitemapRouteInfo } from '@/@types/sitemap.ts'
import { walkStaticRoutes } from '@/helpers/walkStaticRoutes/index.ts'
import type { StaticRoute } from '@/helpers/walkStaticRoutes/types.ts'

import type { SitemapManifest } from '../../types.ts'

// Só o que o sitemap consome, herdado pela cadeia como no createSeo: título e
// descrição não são lidos.
type RouteState = {
  noindex: boolean
  article: boolean
  datePublished: string | undefined
  dateModified: string | undefined
}

type ResolveStateOptions = {
  parent: RouteState
  seo: SeoRouteInfo | undefined
}

type ResolveEntryOptions = {
  path: string
  state: RouteState
}

const INITIAL_STATE: RouteState = {
  noindex: false,
  article: false,
  datePublished: undefined,
  dateModified: undefined
}

function resolveState({ parent, seo }: ResolveStateOptions): RouteState {
  return {
    noindex: seo?.noindex ?? parent.noindex,
    article: seo?.type ? seo.type === 'article' : parent.article,
    datePublished: seo?.article?.datePublished ?? parent.datePublished,
    dateModified: seo?.article?.dateModified ?? parent.dateModified
  }
}

// `lastmod` só em artigo, com as mesmas datas que a página publica no JSON-LD.
function resolveEntry({ path, state }: ResolveEntryOptions): SitemapEntry {
  const lastmod = state.article
    ? (state.dateModified ?? state.datePublished)
    : undefined
  return lastmod === undefined ? { path } : { path, lastmod }
}

// Páginas estáticas do manifesto, sem `noindex`, sem o fallback 404 e sem
// duplicatas, mais as fontes das rotas com parâmetros que declaram
// `route.info.sitemap`. Uma fonte não é executada aqui: só coletada.
export function collectSitemapEntries(
  routes: readonly StaticRoute[]
): SitemapManifest {
  const entries = new Map<string, SitemapEntry>()
  const sources: SitemapRouteInfo[] = []
  walkStaticRoutes<RouteState>({
    routes,
    dynamic: true,
    initialState: INITIAL_STATE,
    visit: ({ route, path, parentState, dynamic }) => {
      const info = route.$$route?.require().route?.info
      const state = resolveState({ parent: parentState, seo: info?.seo })
      if (!route.page) return state
      if (dynamic) {
        if (!state.noindex && info?.sitemap) sources.push(info.sitemap)
        return state
      }
      if (state.noindex) entries.delete(path)
      else entries.set(path, resolveEntry({ path, state }))
      return state
    }
  })
  return { entries: [...entries.values()], sources }
}
