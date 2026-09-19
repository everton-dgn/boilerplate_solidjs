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

  it('registra a página inicial e o fallback a partir dos arquivos reais', async () => {
    const router = new PageFileSystemRouter({
      dir: `${import.meta.dirname}/../routes`,
      extensions: ['js', 'jsx', 'ts', 'tsx']
    })

    const routes = await router.getRoutes()

    expect(routes.map(route => route.path).toSorted()).toStrictEqual([
      '/(home)/',
      '/*404'
    ])
    expect(routes.find(route => route.path === '/*404')?.$$route).toBeDefined()
  })

  it('remove o segmento de agrupamento da URL da página inicial', async () => {
    const router = new PageFileSystemRouter({
      dir: `${import.meta.dirname}/../routes`,
      extensions: ['js', 'jsx', 'ts', 'tsx']
    })

    const pages = buildRouteTree(await router.getRoutes())

    expect(pages.map(page => page.path).toSorted()).toStrictEqual([
      '/',
      '/*404'
    ])
    expect(pages.find(page => page.path === '/')?.id).toBe('/(home)/')
  })
})
