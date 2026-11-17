import { walkStaticRoutes } from '../index.ts'
import type { StaticRoute, WalkStaticRoutesOptions } from '../types.ts'

type Visited = {
  path: string
  parentState: string
}

type VisitedFlat = readonly [path: string, parentState: string]

type VisitedDynamic = readonly [path: string, isDynamic: boolean]

type Visit<State> = WalkStaticRoutesOptions<State>['visit']

const EXTREME_DEPTH = 10_000
const WIDE_COUNT = 10_000

// Each visit returns its own path, and the child receives the path of the parent.
function visitPath(visited: Visited[]): Visit<string> {
  return ({ path, parentState }) => {
    visited.push({ path, parentState })
    return path
  }
}

function flatten(visited: readonly Visited[]): VisitedFlat[] {
  return visited.map(({ path, parentState }) => [path, parentState])
}

function collectPagePaths(routes: readonly StaticRoute[]): string[] {
  const pages: string[] = []
  walkStaticRoutes<null>({
    routes,
    initialState: null,
    visit: ({ route, path }) => {
      if (route.page) pages.push(path)
      return null
    }
  })
  return pages
}

describe('static route walk', () => {
  it('builds absolute paths, normalizes slashes and passes down the state of the parent', () => {
    const visited: Visited[] = []
    walkStaticRoutes<string>({
      routes: [
        {
          path: '/',
          children: [
            { path: '/', page: true },
            {
              path: '//docs//',
              children: [
                { path: '/', page: true },
                { path: 'guia/', page: true },
                { path: '', children: [{ path: 'api', page: true }] }
              ]
            }
          ]
        }
      ],
      initialState: '',
      visit: visitPath(visited)
    })

    expect(flatten(visited)).toStrictEqual([
      ['/', ''],
      ['/', '/'],
      ['/docs', '/'],
      ['/docs', '/docs'],
      ['/docs/guia', '/docs'],
      ['/docs', '/docs'],
      ['/docs/api', '/docs']
    ])
  })

  it('does not visit dynamic branches or their descendants', () => {
    const visit = vi.fn<Visit<null>>(() => null)
    walkStaticRoutes<null>({
      routes: [
        { path: '/users/:id', children: [{ path: '/profile', page: true }] },
        { path: '/*404', page: true },
        { path: '/about', page: true, children: [] }
      ],
      initialState: null,
      visit
    })

    expect(visit).toHaveBeenCalledExactlyOnceWith({
      route: { path: '/about', page: true, children: [] },
      path: '/about',
      parentState: null,
      isDynamic: false
    })
  })

  it('with shouldVisitDynamic, visits branches with a parameter and marks the descendants too', () => {
    const visited: VisitedDynamic[] = []
    walkStaticRoutes<null>({
      routes: [
        { path: '/users/:id', children: [{ path: '/profile', page: true }] },
        { path: '/*404', page: true },
        { path: '/about', page: true, children: [{ path: '/:tab' }] }
      ],
      initialState: null,
      shouldVisitDynamic: true,
      visit: ({ path, isDynamic }) => {
        visited.push([path, isDynamic])
        return null
      }
    })

    expect(visited).toStrictEqual([
      ['/users/:id', true],
      ['/users/:id/profile', true],
      ['/*404', true],
      ['/about', false],
      ['/about/:tab', true]
    ])
  })

  it('walks depth-first, keeping the order of the siblings', () => {
    const visited: Visited[] = []
    walkStaticRoutes<string>({
      routes: [
        { path: '/a', children: [{ path: '/1' }, { path: '/2' }] },
        { path: '/b' }
      ],
      initialState: '',
      visit: visitPath(visited)
    })

    expect(visited.map(({ path }) => path)).toStrictEqual([
      '/a',
      '/a/1',
      '/a/2',
      '/b'
    ])
  })
})

describe('route walk in extreme cases', () => {
  it('walks ten thousand layouts without overflowing the call stack', () => {
    let routes: StaticRoute[] = [{ path: '/leaf', page: true }]
    for (let depth = 0; depth < EXTREME_DEPTH; depth += 1) {
      routes = [{ path: '/', children: routes }]
    }

    expect(collectPagePaths(routes)).toStrictEqual(['/leaf'])
  })

  it('keeps the order of ten thousand sibling routes and normalizes the slashes', () => {
    const routes = Array.from({ length: WIDE_COUNT }, (_, index) => ({
      path: `//page-${index}//`,
      page: true
    }))
    const expected = Array.from(
      { length: WIDE_COUNT },
      (_, index) => `/page-${index}`
    )

    expect(collectPagePaths(routes)).toStrictEqual(expected)
  })
})
