import { buildRouteTree, PageFileSystemRouter } from 'filesystem-routing'

const BASE_LAYOUT_PAGE_COUNT = 2

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

  it('registra a página inicial e o fallback a partir dos arquivos reais', async () => {
    const router = new PageFileSystemRouter({
      dir: `${import.meta.dirname}/../routes`,
      extensions: ['js', 'jsx', 'ts', 'tsx']
    })

    const routes = await router.getRoutes()

    expect(routes.map(route => route.path).toSorted()).toStrictEqual([
      '/(base)',
      '/(base)/(home)/',
      '/(base)/*404'
    ])
    expect(
      routes.find(route => route.path === '/(base)/*404')?.$$route
    ).toBeDefined()
  })

  it('remove o segmento de agrupamento da URL da página inicial', async () => {
    const router = new PageFileSystemRouter({
      dir: `${import.meta.dirname}/../routes`,
      extensions: ['js', 'jsx', 'ts', 'tsx']
    })

    const pages = buildRouteTree(await router.getRoutes())

    expect(pages).toHaveLength(1)
    expect(pages[0]).toMatchObject({ id: '/(base)', path: '/' })
    expect(pages[0]?.children).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: '/(home)/', path: '/' }),
        expect.objectContaining({ id: '/*404', path: '/*404' })
      ])
    )
    expect(pages[0]?.children).toHaveLength(BASE_LAYOUT_PAGE_COUNT)
  })
})
