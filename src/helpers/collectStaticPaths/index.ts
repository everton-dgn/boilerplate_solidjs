import { walkStaticRoutes } from '@/helpers/walkStaticRoutes/index.ts'
import type { StaticRoute } from '@/helpers/walkStaticRoutes/types.ts'

// Caminhos das páginas estáticas do manifesto de rotas, sem parâmetros
// dinâmicos, sem noindex, sem o fallback 404 e sem duplicatas.
export function collectStaticPaths(routes: readonly StaticRoute[]): string[] {
  const paths = new Set<string>()
  walkStaticRoutes({
    routes,
    initialState: false,
    visit: ({ route, path, parentState }) => {
      const noindex =
        route.$$route?.require().route?.info?.seo?.noindex ?? parentState
      if (route.page) {
        if (noindex) paths.delete(path)
        else paths.add(path)
      }
      return noindex
    }
  })
  return [...paths]
}
