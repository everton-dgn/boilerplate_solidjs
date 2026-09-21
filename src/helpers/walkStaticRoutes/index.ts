import type { WalkFrame, WalkStaticRoutesOptions } from './types.ts'

const DYNAMIC_SEGMENT = /[:*]/u

// O frame atual fica fora da pilha, que guarda só os ancestrais: um frame por
// nível, sem recursão nem cópia dos irmãos.
export function walkStaticRoutes<State>({
  routes,
  initialState,
  visit,
  dynamic: visitDynamic = false
}: WalkStaticRoutesOptions<State>): void {
  const stack: WalkFrame<State>[] = []
  let frame: WalkFrame<State> | undefined = {
    routes,
    index: 0,
    parent: '',
    state: initialState,
    dynamic: false
  }

  while (frame) {
    const route = frame.routes[frame.index]
    if (!route) {
      frame = stack.pop()
      continue
    }
    frame.index += 1
    const dynamic = frame.dynamic || DYNAMIC_SEGMENT.test(route.path)
    if (dynamic && !visitDynamic) continue

    const segment = route.path
      .replaceAll(/\/+/gu, '/')
      .replaceAll(/^\/|\/$/gu, '')
    const parent = frame.parent === '/' ? '' : frame.parent
    const path = segment ? `${parent}/${segment}` : parent || '/'
    const state = visit({ route, path, parentState: frame.state, dynamic })
    if (route.children?.length) {
      stack.push(frame)
      frame = { routes: route.children, index: 0, parent: path, state, dynamic }
    }
  }
}
