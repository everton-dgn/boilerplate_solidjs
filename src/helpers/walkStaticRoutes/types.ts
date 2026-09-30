import type { RouteDefinition } from '@solidjs/router'

type RouteModule = {
  route?: RouteDefinition
}

type RouteReference = {
  require: () => RouteModule
}

type VisitStaticRouteOptions<State> = {
  route: StaticRoute
  path: string
  parentState: State
  // `true` quando o caminho completo tem algum segmento com parâmetro.
  dynamic: boolean
}

export type StaticRoute = {
  path: string
  page?: boolean | undefined
  $$route?: RouteReference | undefined
  children?: readonly StaticRoute[] | undefined
}

export type WalkStaticRoutesOptions<State> = {
  routes: readonly StaticRoute[]
  initialState: State
  visit: (options: VisitStaticRouteOptions<State>) => State
  // Por padrão, ramos com parâmetro são pulados inteiros. Com `true`, eles
  // são visitados e marcados como `dynamic`.
  dynamic?: boolean
}

export type WalkFrame<State> = {
  routes: readonly StaticRoute[]
  index: number
  parent: string
  state: State
  dynamic: boolean
}
