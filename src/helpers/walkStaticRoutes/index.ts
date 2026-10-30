import type { StaticRoute, WalkStaticRoutesOptions } from './types.ts'

type WalkFrame<State> = {
  routes: readonly StaticRoute[]
  index: number
  parent: string
  state: State
  isDynamic: boolean
}

const DYNAMIC_SEGMENT = /[:*]/u

export function walkStaticRoutes<State>({
  routes,
  initialState,
  visit,
  shouldVisitDynamic = false
}: WalkStaticRoutesOptions<State>): void {
  const stack: WalkFrame<State>[] = []
  let frame: WalkFrame<State> | undefined = {
    routes,
    index: 0,
    parent: '',
    state: initialState,
    isDynamic: false
  }

  while (frame) {
    const route = frame.routes[frame.index]
    if (!route) {
      frame = stack.pop()
      continue
    }
    frame.index += 1
    const isDynamic = frame.isDynamic || DYNAMIC_SEGMENT.test(route.path)
    if (isDynamic && !shouldVisitDynamic) continue

    const segment = route.path
      .replaceAll(/\/+/gu, '/')
      .replaceAll(/^\/|\/$/gu, '')
    const parent = frame.parent === '/' ? '' : frame.parent
    const path = segment ? `${parent}/${segment}` : parent || '/'
    const state = visit({
      route,
      path,
      parentState: frame.state,
      isDynamic
    })
    if (route.children?.length) {
      stack.push(frame)
      frame = {
        routes: route.children,
        index: 0,
        parent: path,
        state,
        isDynamic
      }
    }
  }
}
