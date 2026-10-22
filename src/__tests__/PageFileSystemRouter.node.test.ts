import { buildRouteTree, PageFileSystemRouter } from 'filesystem-routing'

const BASE_LAYOUT_PAGE_COUNT = 5

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

    expect(routes.map(route => route.path)).toStrictEqual(
      expect.arrayContaining(['/(base)/(home)/', '/(base)/*404/'])
    )
    expect(
      routes.find(route => route.path === '/(base)/*404/')?.$$route
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
        expect.objectContaining({ id: '/*404/', path: '/*404/' }),
        expect.objectContaining({ id: '/about/', path: '/about/' }),
        expect.objectContaining({ id: '/contact/', path: '/contact/' }),
        expect.objectContaining({ id: '/privacy/', path: '/privacy/' })
      ])
    )
    expect(pages[0]?.children).toHaveLength(BASE_LAYOUT_PAGE_COUNT)
  })

  it('mantém a ordem da varredura quando uma rota muda ou volta', async () => {
    const router = new PageFileSystemRouter({
      dir: `${import.meta.dirname}/../routes`,
      extensions: ['js', 'jsx', 'ts', 'tsx']
    })
    const routes = await router.getRoutes()
    const scanned = routes.map(route => route.path)
    const [firstFile] = Object.values(routes[0] ?? {}).flatMap(value =>
      typeof value === 'object' &&
      value !== null &&
      'src' in value &&
      typeof value.src === 'string'
        ? [value.src]
        : []
    )
    if (!firstFile) throw new Error('A primeira rota não tem arquivo')

    await router.updateRoute(firstFile)
    const afterUpdate = router.routes.map(route => route.path)
    router.removeRoute(firstFile)
    await router.addRoute(firstFile)

    expect({
      afterUpdate,
      afterReadd: router.routes.map(route => route.path)
    }).toStrictEqual({ afterUpdate: scanned, afterReadd: scanned })
  })
})
