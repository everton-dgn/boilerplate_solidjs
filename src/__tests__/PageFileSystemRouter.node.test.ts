import { buildRouteTree, PageFileSystemRouter } from 'filesystem-routing'

describe('roteamento por arquivo', () => {
  it('descobre páginas dinâmicas sem registrar componentes colocalizados', async () => {
    const router = new PageFileSystemRouter({
      dir: `${import.meta.dirname}/../tests/fixtures/routes`,
      extensions: ['ts', 'tsx']
    })

    const routes = await router.getRoutes()

    expect(routes.map(route => route.path)).toStrictEqual(['/users/:id'])
    expect(routes[0]).toMatchObject({ page: true })
  })

  it('registra a página inicial e o fallback e remove o agrupamento da URL', async () => {
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
