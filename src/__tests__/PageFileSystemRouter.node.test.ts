import { buildRouteTree, PageFileSystemRouter } from 'filesystem-routing'

describe('file-based routing', () => {
  it('finds dynamic pages without registering colocated components', async () => {
    const router = new PageFileSystemRouter({
      dir: `${import.meta.dirname}/../tests/fixtures/routes`,
      extensions: ['ts', 'tsx']
    })

    const routes = await router.getRoutes()

    expect(routes.map(route => route.path)).toStrictEqual(['/users/:id'])
    expect(routes[0]).toMatchObject({ page: true })
  })

  it('registers the home page and the fallback and removes the grouping from the URL', async () => {
    const router = new PageFileSystemRouter({
      dir: `${import.meta.dirname}/../routes`,
      extensions: ['js', 'jsx', 'ts', 'tsx']
    })

    const routes = await router.getRoutes()

    expect(routes.map(route => route.path)).toStrictEqual(
      expect.arrayContaining(['/(base)/(home)/', '/(base)/*404/'])
    )
    expect(
      routes.find(route => route.path === '/(base)/*404/')?.$$route
    ).toBeDefined()
    const pages = buildRouteTree(routes)
    expect(pages).toHaveLength(1)
    expect(pages[0]).toMatchObject({ id: '/(base)', path: '/' })
    expect(pages[0]?.children).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: '/(home)/', path: '/' })
      ])
    )
  })
})
