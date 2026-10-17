import { locales } from '@paraglide/runtime.js'

import { walkStaticRoutes } from '@/helpers/walkStaticRoutes/index.ts'
import type { StaticRoute } from '@/helpers/walkStaticRoutes/types.ts'
import { localizeHref } from '@/i18n/urls/index.ts'

// Rotas com parâmetro ficam fora: o build não conhece seus valores e elas
// continuam convertidas na requisição.
export function collectStaticMarkdownPages(
  routes: readonly StaticRoute[]
): string[] {
  const pages = new Set<string>()
  walkStaticRoutes<undefined>({
    routes,
    initialState: undefined,
    visit: ({ route, path, parentState }) => {
      if (
        route.page &&
        route.$$route?.require().route?.info?.markdown === true
      ) {
        pages.add(path)
      }
      return parentState
    }
  })
  return [...pages].flatMap(path =>
    locales.map(locale => localizeHref({ href: path, locale }))
  )
}
