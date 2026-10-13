import type { LlmsPage, LlmsSelection } from '@/@types/llms.ts'
import type { SeoMetadata } from '@/@types/seo.ts'
import { resolveRouteSeo } from '@/helpers/resolveRouteSeo/index.ts'
import { walkStaticRoutes } from '@/helpers/walkStaticRoutes/index.ts'
import type { StaticRoute } from '@/helpers/walkStaticRoutes/types.ts'

import { resolveRouteLlms } from '../resolveRouteLlms/index.ts'

type RouteState = {
  seo: SeoMetadata
  llms: LlmsSelection
}

type StaticPage = RouteState & { path: string }

// O índice filho pode compartilhar a URL do layout; seus metadados prevalecem.
export function collectLlmsPages(routes: readonly StaticRoute[]): LlmsPage[] {
  const pages = new Map<string, StaticPage>()
  walkStaticRoutes<RouteState>({
    routes,
    initialState: { seo: resolveRouteSeo([]), llms: resolveRouteLlms({}) },
    visit: ({ route, path, parentState }) => {
      const info = route.$$route?.require().route?.info
      const state = {
        seo: resolveRouteSeo([parentState.seo, info?.seo]),
        llms: resolveRouteLlms({ parent: parentState.llms, info: info?.llms })
      }
      if (route.page) pages.set(path, { path, ...state })
      return state
    }
  })
  return [...pages.values()]
    .filter(({ seo, llms }) => llms.shouldInclude && !seo.noindex)
    .map(({ path, seo, llms }) => ({
      path,
      title: seo.title,
      description: seo.description,
      section: llms.section,
      optional: llms.isOptional
    }))
}
