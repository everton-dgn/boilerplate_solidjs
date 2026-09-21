import type { RouteDefinition } from '@solidjs/router'

type RouteModule = {
  route?: RouteDefinition
}

type RouteReference = {
  require: () => RouteModule
}

type StaticRoute = {
  path: string
  page?: boolean | undefined
  $$route?: RouteReference | undefined
  children?: readonly StaticRoute[] | undefined
}

type VisitStaticRouteOptions<State> = {
  route: StaticRoute
  path: string
  parentState: State
}

type WalkStaticRoutesOptions<State> = {
  routes: readonly StaticRoute[]
  initialState: State
  visit: (options: VisitStaticRouteOptions<State>) => State
}

type WalkFrame<State> = {
  routes: readonly StaticRoute[]
  index: number
  parent: string
  state: State
}

export type { StaticRoute, WalkStaticRoutesOptions, WalkFrame }
