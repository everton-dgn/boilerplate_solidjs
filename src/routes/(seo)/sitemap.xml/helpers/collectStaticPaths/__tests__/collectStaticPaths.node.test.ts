import { collectStaticPaths } from '../index.ts'

describe('coleta das páginas estáticas', () => {
  it('lista só páginas estáticas, com aninhamento e sem duplicatas', () => {
    const paths = collectStaticPaths([
      { path: '/', page: true },
      { path: '/*404', page: true },
      { path: '/users/:id', page: true },
      { path: '/api/health' },
      {
        path: '/docs',
        page: true,
        children: [
          { path: '/', page: true },
          { path: '/guia', page: true },
          { path: '/:slug', page: true }
        ]
      }
    ])

    expect(paths).toStrictEqual(['/', '/docs', '/docs/guia'])
  })

  it('consulta só noindex, sem ler título e descrição nem executar preload', () => {
    const preload = vi.fn<() => void>()
    const paths = collectStaticPaths([
      {
        path: '/docs',
        page: true,
        $$route: {
          require: () => ({
            route: {
              preload,
              info: {
                seo: {
                  noindex: false,
                  get title(): string {
                    throw new Error('O sitemap não precisa do título')
                  },
                  get description(): string {
                    throw new Error('O sitemap não precisa da descrição')
                  }
                }
              }
            }
          })
        },
        children: [
          {
            path: '/',
            page: true,
            $$route: {
              require: () => ({ route: { info: { seo: { noindex: true } } } })
            }
          },
          { path: '/guide', page: true }
        ]
      }
    ])

    expect(paths).toStrictEqual(['/docs/guide'])
    expect(preload).not.toHaveBeenCalled()
  })

  it('herda noindex e permite que uma filha se torne indexável explicitamente', () => {
    const paths = collectStaticPaths([
      {
        path: '/account',
        page: true,
        $$route: {
          require: () => ({ route: { info: { seo: { noindex: true } } } })
        },
        children: [
          { path: '/settings', page: true },
          {
            path: '/public',
            page: true,
            $$route: {
              require: () => ({
                route: { info: { seo: { noindex: false } } }
              })
            }
          }
        ]
      }
    ])

    expect(paths).toStrictEqual(['/account/public'])
  })
})
