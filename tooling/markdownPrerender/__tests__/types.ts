import type { PrerenderRoute } from 'nitro/types'

export type PrerenderResult = {
  prerenderedRoutes: PrerenderRoute[]
  failedRoutes: PrerenderRoute[]
}

export type Prerender = { routes?: string[]; failOnError?: boolean }
