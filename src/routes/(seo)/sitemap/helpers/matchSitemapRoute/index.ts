import { createRouter, type RouteDefinition } from '@solidjs/router'

import type { StaticRoute } from '@/helpers/walkStaticRoutes/types.ts'
import { delocalizePathname } from '@/i18n/urls/index.ts'

type ConvertOptions = {
  route: StaticRoute
  parent: string
  identities: WeakMap<object, string>
}

function toDefinition({
  route,
  parent,
  identities
}: ConvertOptions): RouteDefinition {
  const path =
    `${parent}/${route.path}`.replaceAll(/\/+/gu, '/').replace(/\/$/u, '') ||
    '/'
  const definition = route.$$route?.require().route
  const info = { ...definition?.info }
  identities.set(info, path)
  return {
    path: route.path,
    matchFilters: definition?.matchFilters,
    info,
    children: route.children?.map(child =>
      toDefinition({ route: child, parent: path, identities })
    )
  }
}

export function matchSitemapRoute(
  routes: readonly StaticRoute[]
): (path: string) => string | undefined {
  const identities = new WeakMap<object, string>()
  const router = createRouter({
    routes: routes.map(route => toDefinition({ route, parent: '', identities }))
  })
  return path => {
    const match = router.match(delocalizePathname(path)).at(-1)
    return match?.info ? identities.get(match.info) : undefined
  }
}
