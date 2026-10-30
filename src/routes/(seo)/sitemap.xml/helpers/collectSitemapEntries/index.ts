import type { SeoRouteInfo } from '@/@types/seo.ts'
import type { SitemapEntry, SitemapRouteInfo } from '@/@types/sitemap.ts'
import { walkStaticRoutes } from '@/helpers/walkStaticRoutes/index.ts'
import type { StaticRoute } from '@/helpers/walkStaticRoutes/types.ts'

import type { SitemapManifest } from '../../types.ts'

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

type PageSource = {
  sitemap: SitemapRouteInfo
  isIndexable: boolean
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

function resolveEntry({ path, state }: ResolveEntryOptions): SitemapEntry {
  const lastmod = state.article
    ? (state.dateModified ?? state.datePublished)
    : undefined
  return lastmod === undefined ? { path } : { path, lastmod }
}

// O índice filho pode compartilhar a URL do layout; seus metadados prevalecem.
export function collectSitemapEntries(
  routes: readonly StaticRoute[]
): SitemapManifest {
  const entries = new Map<string, SitemapEntry>()
  const sources = new Map<string, PageSource>()
  walkStaticRoutes<RouteState>({
    routes,
    shouldVisitDynamic: true,
    initialState: INITIAL_STATE,
    visit: ({ route, path, parentState, isDynamic }) => {
      const info = route.$$route?.require().route?.info
      const state = resolveState({ parent: parentState, seo: info?.seo })
      if (!route.page) return state
      if (isDynamic) {
        const sitemap = info?.sitemap ?? sources.get(path)?.sitemap
        if (sitemap) sources.set(path, { sitemap, isIndexable: !state.noindex })
        return state
      }
      if (state.noindex) entries.delete(path)
      else entries.set(path, resolveEntry({ path, state }))
      return state
    }
  })
  return {
    entries: [...entries.values()],
    sources: [...sources.values()]
      .filter(({ isIndexable }) => isIndexable)
      .map(({ sitemap }) => sitemap)
  }
}
