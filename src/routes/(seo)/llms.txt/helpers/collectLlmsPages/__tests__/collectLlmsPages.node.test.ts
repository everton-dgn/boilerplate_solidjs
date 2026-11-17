import { SITE } from '@/constants/site/index.ts'
import type { StaticRoute } from '@/helpers/walkStaticRoutes/types.ts'

import { collectLlmsPages } from '../index.ts'

type ReadRouteModule = NonNullable<StaticRoute['$$route']>['require']

describe('collection of the pages selected for llms.txt', () => {
  it('inherits fields from the layout and prefers the child index at the same URL', () => {
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
                  title: 'Documentation',
                  description: 'Project guides.'
                },
                llms: { section: 'Guides' }
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
                  info: { seo: { title: 'Overview' }, llms: true }
                }
              })
            }
          },
          {
            path: '/guide',
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
        title: 'Overview',
        description: 'Project guides.',
        section: 'Guides',
        isOptional: false
      },
      {
        path: '/docs/guide',
        title: 'Documentation',
        description: 'Project guides.',
        section: 'Guides',
        isOptional: true
      }
    ])
    expect(preload).not.toHaveBeenCalled()
  })

  it('excludes pages without the flag, APIs and dynamic branches and uses SITE as the fallback', () => {
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
        section: 'Pages',
        isOptional: false
      }
    ])
    expect(readDynamicRoute).not.toHaveBeenCalled()
  })
})

describe('inheritance of the llms.txt selection along the route chain', () => {
  it('excludes an inherited noindex and llms: false, and accepts turning it back on in the child route', () => {
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

  it('turns it back on with true keeping the inherited section, and includes with an empty object inheriting everything', () => {
    const pages = collectLlmsPages([
      {
        path: '/guides',
        page: true,
        $$route: {
          require: () => ({
            route: { info: { llms: { section: 'Guides', optional: true } } }
          })
        },
        children: [
          {
            path: '/draft',
            page: true,
            $$route: {
              require: () => ({ route: { info: { llms: false } } })
            },
            children: [
              {
                path: '/published',
                page: true,
                $$route: {
                  require: () => ({ route: { info: { llms: true } } })
                }
              }
            ]
          },
          {
            path: '/inherited',
            page: true,
            $$route: { require: () => ({ route: { info: { llms: {} } } }) }
          }
        ]
      }
    ])

    expect(
      pages.map(page => [page.path, page.section, page.isOptional])
    ).toStrictEqual([
      ['/guides', 'Guides', true],
      ['/guides/draft/published', 'Guides', true],
      ['/guides/inherited', 'Guides', true]
    ])
  })

  it('overrides in the child only the declared section and optional mark', () => {
    const pages = collectLlmsPages([
      {
        path: '/guides',
        page: true,
        $$route: {
          require: () => ({
            route: { info: { llms: { section: 'Guides', optional: true } } }
          })
        },
        children: [
          {
            path: '/reference',
            page: true,
            $$route: {
              require: () => ({
                route: { info: { llms: { section: 'Reference' } } }
              })
            }
          },
          {
            path: '/essential',
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
      pages.map(page => [page.path, page.section, page.isOptional])
    ).toStrictEqual([
      ['/guides', 'Guides', true],
      ['/guides/reference', 'Reference', true],
      ['/guides/essential', 'Guides', false]
    ])
  })

  it('applies the noindex of the child index after resolving the shared URL', () => {
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

  it('excludes the shared URL when the child index declares llms: false', () => {
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
