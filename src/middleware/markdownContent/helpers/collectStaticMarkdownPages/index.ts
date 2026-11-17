import { locales } from '@paraglide/runtime.js'

import { walkStaticRoutes } from '@/helpers/walkStaticRoutes/index.ts'
import type { StaticRoute } from '@/helpers/walkStaticRoutes/types.ts'
import { localizeHref } from '@/i18n/urls/index.ts'

// Routes with a parameter stay out: the build does not know their values, and
// they are still converted on the request.
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
