import type { LlmsPage, LlmsRouteInfo } from '@/@types/llms.ts'
import type { SeoMetadata } from '@/@types/seo.ts'
import { resolveRouteSeo } from '@/helpers/resolveRouteSeo/index.ts'
import { walkStaticRoutes } from '@/helpers/walkStaticRoutes/index.ts'
import type { StaticRoute } from '@/helpers/walkStaticRoutes/types.ts'

type LlmsSelection = {
  include: boolean
  section: string
  optional: boolean
}

type ResolveRouteLlmsOptions = {
  parent: LlmsSelection
  info: LlmsRouteInfo | undefined
}

type RouteState = {
  seo: SeoMetadata
  llms: LlmsSelection
}

type StaticPage = RouteState & { path: string }

const DEFAULT_SELECTION: LlmsSelection = {
  include: false,
  section: 'Páginas',
  optional: false
}

// A rota decide a inclusão e sobrescreve só o que declara; seção e marcação
// opcional são herdadas do layout.
function resolveRouteLlms({
  parent,
  info
}: ResolveRouteLlmsOptions): LlmsSelection {
  if (info === undefined) return { ...parent }
  if (typeof info === 'boolean') return { ...parent, include: info }
  return {
    include: true,
    section: info.section ?? parent.section,
    optional: info.optional ?? parent.optional
  }
}

// Páginas estáticas selecionadas por `route.info.llms` e sem `noindex`. O
// índice filho pode compartilhar a URL do layout; seus metadados prevalecem.
export function collectLlmsPages(routes: readonly StaticRoute[]): LlmsPage[] {
  const pages = new Map<string, StaticPage>()
  walkStaticRoutes<RouteState>({
    routes,
    initialState: { seo: resolveRouteSeo([]), llms: DEFAULT_SELECTION },
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
    .filter(({ seo, llms }) => llms.include && !seo.noindex)
    .map(({ path, seo, llms }) => ({
      path,
      title: seo.title,
      description: seo.description,
      section: llms.section,
      optional: llms.optional
    }))
}
