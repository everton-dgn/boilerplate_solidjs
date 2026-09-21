import { SITE } from '@/constants/site.ts'
import type { StaticRoute } from '@/helpers/walkStaticRoutes/types.ts'

import { collectLlmsPages } from '../index.ts'

type ReadRouteModule = NonNullable<StaticRoute['$$route']>['require']

describe('coleta das páginas selecionadas para o llms.txt', () => {
  it('herda campos do layout e prefere o índice filho na mesma URL', () => {
    const preload = vi.fn<() => void>()
    const pages = collectLlmsPages([
      {
        path: '/docs',
        page: true,
        $$route: {
          require: () => ({
            route: {
              preload,
              info: {
                seo: {
                  title: 'Documentação',
                  description: 'Guias do projeto.'
                },
                llms: { section: 'Guias' }
              }
            }
          })
        },
        children: [
          {
            path: '/',
            page: true,
            $$route: {
              require: () => ({
                route: {
                  info: { seo: { title: 'Visão geral' }, llms: true }
                }
              })
            }
          },
          {
            path: '/guia',
            page: true,
            $$route: {
              require: () => ({
                route: { info: { llms: { optional: true } } }
              })
            }
          }
        ]
      }
    ])

    expect(pages).toStrictEqual([
      {
        path: '/docs',
        title: 'Visão geral',
        description: 'Guias do projeto.',
        section: 'Guias',
        optional: false
      },
      {
        path: '/docs/guia',
        title: 'Documentação',
        description: 'Guias do projeto.',
        section: 'Guias',
        optional: true
      }
    ])
    expect(preload).not.toHaveBeenCalled()
  })

  it('exclui páginas sem a flag, APIs e ramos dinâmicos e usa SITE como fallback', () => {
    const readDynamicRoute = vi.fn<ReadRouteModule>()
    const pages = collectLlmsPages([
      {
        path: '/',
        page: true,
        $$route: { require: () => ({ route: { info: { llms: true } } }) }
      },
      { path: '/about', page: true },
      {
        path: '/api/health',
        $$route: { require: () => ({ route: { info: { llms: true } } }) }
      },
      { path: '/*404', page: true },
      {
        path: '/users/:id',
        page: true,
        $$route: { require: readDynamicRoute },
        children: [{ path: '/profile', page: true }]
      }
    ])

    expect(pages).toStrictEqual([
      {
        path: '/',
        title: SITE.title,
        description: SITE.description,
        section: 'Páginas',
        optional: false
      }
    ])
    expect(readDynamicRoute).not.toHaveBeenCalled()
  })
})

describe('herança da seleção de llms.txt na cadeia de rotas', () => {
  it('exclui noindex herdado e llms: false, e aceita a reativação na rota filha', () => {
    const pages = collectLlmsPages([
      {
        path: '/account',
        page: true,
        $$route: {
          require: () => ({
            route: { info: { seo: { noindex: true }, llms: true } }
          })
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
      },
      {
        path: '/docs',
        page: true,
        $$route: {
          require: () => ({ route: { info: { llms: true } } })
        },
        children: [
          {
            path: '/internal',
            page: true,
            $$route: {
              require: () => ({ route: { info: { llms: false } } })
            }
          }
        ]
      }
    ])

    expect(pages.map(page => page.path)).toStrictEqual([
      '/account/public',
      '/docs'
    ])
  })

  it('reativa com true preservando a seção herdada e inclui com objeto vazio herdando tudo', () => {
    const pages = collectLlmsPages([
      {
        path: '/guias',
        page: true,
        $$route: {
          require: () => ({
            route: { info: { llms: { section: 'Guias', optional: true } } }
          })
        },
        children: [
          {
            path: '/rascunho',
            page: true,
            $$route: {
              require: () => ({ route: { info: { llms: false } } })
            },
            children: [
              {
                path: '/publicado',
                page: true,
                $$route: {
                  require: () => ({ route: { info: { llms: true } } })
                }
              }
            ]
          },
          {
            path: '/herdado',
            page: true,
            $$route: { require: () => ({ route: { info: { llms: {} } } }) }
          }
        ]
      }
    ])

    expect(
      pages.map(page => [page.path, page.section, page.optional])
    ).toStrictEqual([
      ['/guias', 'Guias', true],
      ['/guias/rascunho/publicado', 'Guias', true],
      ['/guias/herdado', 'Guias', true]
    ])
  })

  it('sobrescreve na filha só a seção e a marcação opcional declaradas', () => {
    const pages = collectLlmsPages([
      {
        path: '/guias',
        page: true,
        $$route: {
          require: () => ({
            route: { info: { llms: { section: 'Guias', optional: true } } }
          })
        },
        children: [
          {
            path: '/referencia',
            page: true,
            $$route: {
              require: () => ({
                route: { info: { llms: { section: 'Referência' } } }
              })
            }
          },
          {
            path: '/essencial',
            page: true,
            $$route: {
              require: () => ({
                route: { info: { llms: { optional: false } } }
              })
            }
          }
        ]
      }
    ])

    expect(
      pages.map(page => [page.path, page.section, page.optional])
    ).toStrictEqual([
      ['/guias', 'Guias', true],
      ['/guias/referencia', 'Referência', true],
      ['/guias/essencial', 'Guias', false]
    ])
  })

  it('aplica o noindex do índice filho após resolver a URL compartilhada', () => {
    const pages = collectLlmsPages([
      {
        path: '/docs',
        page: true,
        $$route: {
          require: () => ({ route: { info: { llms: true } } })
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

    expect(pages.map(page => page.path)).toStrictEqual(['/docs/guide'])
  })

  it('exclui a URL compartilhada quando o índice filho declara llms: false', () => {
    const pages = collectLlmsPages([
      {
        path: '/docs',
        page: true,
        $$route: {
          require: () => ({ route: { info: { llms: true } } })
        },
        children: [
          {
            path: '/',
            page: true,
            $$route: {
              require: () => ({ route: { info: { llms: false } } })
            }
          },
          { path: '/guide', page: true }
        ]
      }
    ])

    expect(pages.map(page => page.path)).toStrictEqual(['/docs/guide'])
  })
})
