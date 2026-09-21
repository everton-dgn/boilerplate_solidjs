import { collectLlmsPages } from '@/helpers/collectLlmsPages/index.ts'
import { collectStaticPaths } from '@/helpers/collectStaticPaths/index.ts'

import { walkStaticRoutes } from '../index.ts'
import type { StaticRoute, WalkStaticRoutesOptions } from '../types.ts'

type Visited = {
  path: string
  parentState: string
}

type VisitedFlat = readonly [path: string, parentState: string]

type Visit<State> = WalkStaticRoutesOptions<State>['visit']

const EXTREME_DEPTH = 10_000
const WIDE_COUNT = 10_000
const LAST_ITEM = -1

// Cada visita devolve o próprio caminho, e a filha recebe o caminho do pai.
function visitPath(visited: Visited[]): Visit<string> {
  return ({ path, parentState }) => {
    visited.push({ path, parentState })
    return path
  }
}

function flatten(visited: readonly Visited[]): VisitedFlat[] {
  return visited.map(({ path, parentState }) => [path, parentState])
}

describe('travessia das rotas estáticas', () => {
  it('compõe caminhos absolutos, normaliza barras e propaga o estado do pai', () => {
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

  it('não visita ramos dinâmicos nem seus descendentes', () => {
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
      parentState: null
    })
  })

  it('percorre em profundidade, preservando a ordem dos irmãos', () => {
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

describe('travessia das rotas em casos extremos', () => {
  it('atravessa dez mil layouts sem estourar a pilha de chamadas', () => {
    let routes: StaticRoute[] = [
      {
        path: '/leaf',
        page: true,
        $$route: { require: () => ({ route: { info: { llms: true } } }) }
      }
    ]
    for (let depth = 0; depth < EXTREME_DEPTH; depth += 1) {
      routes = [{ path: '/', children: routes }]
    }

    expect(collectStaticPaths(routes)).toStrictEqual(['/leaf'])
    expect(collectLlmsPages(routes).map(page => page.path)).toStrictEqual([
      '/leaf'
    ])
  })

  it('preserva a ordem de dez mil rotas irmãs e normaliza as barras', () => {
    const routes = Array.from({ length: WIDE_COUNT }, (_, index) => ({
      path: `//page-${index}//`,
      page: true
    }))
    const paths = collectStaticPaths(routes)

    expect(paths).toHaveLength(WIDE_COUNT)
    expect(paths[0]).toBe('/page-0')
    expect(paths.at(LAST_ITEM)).toBe(`/page-${WIDE_COUNT - 1}`)
    expect(new Set(paths).size).toBe(WIDE_COUNT)
  })
})
