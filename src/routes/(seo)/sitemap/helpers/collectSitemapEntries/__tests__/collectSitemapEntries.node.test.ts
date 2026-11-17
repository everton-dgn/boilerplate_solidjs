import type { RouteDefinition } from '@solidjs/router'

import type { StaticRoute } from '@/helpers/walkStaticRoutes/types.ts'

import { collectSitemapEntries } from '../index.ts'

type RouteInfo = NonNullable<RouteDefinition['info']>

type PageOptions = {
  path: string
  page?: boolean
  info?: RouteInfo
  preload?: RouteDefinition['preload']
  children?: readonly StaticRoute[]
}

function page({
  path,
  page: isPage = true,
  info,
  preload,
  children
}: PageOptions): StaticRoute {
  const route = { ...(info ? { info } : {}), ...(preload ? { preload } : {}) }
  return {
    path,
    page: isPage,
    $$route: info || preload ? { require: () => ({ route }) } : undefined,
    children
  }
}

describe('static page collection', () => {
  it('lists only static pages, with nesting and without duplicates', () => {
    const manifest = collectSitemapEntries([
      { path: '/', page: true },
      { path: '/*404', page: true },
      { path: '/users/:id', page: true },
      { path: '/api/health' },
      {
        path: '/docs',
        page: true,
        children: [
          { path: '/', page: true },
          { path: '/guide', page: true },
          { path: '/:slug', page: true }
        ]
      }
    ])

    expect(manifest).toStrictEqual({
      entries: [{ path: '/' }, { path: '/docs' }, { path: '/docs/guide' }],
      sources: [],
      sourceRoutes: [],
      dynamicRoutes: [
        { path: '/*404', isIndexable: true },
        { path: '/users/:id', isIndexable: true },
        { path: '/docs/:slug', isIndexable: true }
      ]
    })
  })

  it('reads only noindex, type and dates, without reading the title and the description or running the preload', () => {
    const preload = vi.fn<() => void>()
    const manifest = collectSitemapEntries([
      page({
        path: '/docs',
        preload,
        info: {
          seo: {
            noindex: false,
            get title(): string {
              throw new Error('The sitemap does not need the title')
            },
            get description(): string {
              throw new Error('The sitemap does not need the description')
            }
          }
        },
        children: [
          page({ path: '/', info: { seo: { noindex: true } } }),
          page({ path: '/guide' })
        ]
      })
    ])

    expect(manifest.entries).toStrictEqual([{ path: '/docs/guide' }])
    expect(preload).not.toHaveBeenCalled()
  })

  it('inherits noindex and lets a child become indexable explicitly', () => {
    const manifest = collectSitemapEntries([
      page({
        path: '/account',
        info: { seo: { noindex: true } },
        children: [
          page({ path: '/settings' }),
          page({ path: '/public', info: { seo: { noindex: false } } })
        ]
      })
    ])

    expect(manifest.entries).toStrictEqual([{ path: '/account/public' }])
  })
})

describe('lastmod of the static pages', () => {
  it('publishes lastmod only on articles, preferring the modification date', () => {
    const manifest = collectSitemapEntries([
      page({
        path: '/article',
        info: {
          seo: {
            type: 'article',
            article: { datePublished: '2026-09-01', dateModified: '2026-09-21' }
          }
        }
      }),
      page({
        path: '/new',
        info: {
          seo: { type: 'article', article: { datePublished: '2026-09-01' } }
        }
      }),
      page({
        path: '/institutional',
        info: {
          seo: {
            type: 'website',
            article: { datePublished: '2026-09-01', dateModified: '2026-09-21' }
          }
        }
      }),
      page({ path: '/undated', info: { seo: { type: 'article' } } })
    ])

    expect(manifest.entries).toStrictEqual([
      { path: '/article', lastmod: '2026-09-21' },
      { path: '/new', lastmod: '2026-09-01' },
      { path: '/institutional' },
      { path: '/undated' }
    ])
  })

  it('inherits the type and the dates from the layout and lets the child override only what it declares', () => {
    const manifest = collectSitemapEntries([
      page({
        path: '/docs',
        info: {
          seo: { type: 'article', article: { datePublished: '2026-09-01' } }
        },
        children: [
          page({
            path: '/',
            info: { seo: { article: { dateModified: '2026-09-21' } } }
          }),
          page({ path: '/guide' }),
          page({ path: '/site', info: { seo: { type: 'website' } } })
        ]
      })
    ])

    expect(manifest.entries).toStrictEqual([
      { path: '/docs', lastmod: '2026-09-21' },
      { path: '/docs/guide', lastmod: '2026-09-01' },
      { path: '/docs/site' }
    ])
  })
})

describe('sources of the routes with a parameter', () => {
  it('collects the sources of the pages with a parameter without running them', () => {
    const listPosts = vi.fn<() => never[]>(() => [])
    const listStatic = vi.fn<() => never[]>(() => [])
    const manifest = collectSitemapEntries([
      page({ path: '/blog/:slug', info: { sitemap: listPosts } }),
      page({ path: '/tags/:tag' }),
      page({ path: '/about', info: { sitemap: listStatic } }),
      page({ path: '/api/:id', page: false, info: { sitemap: listStatic } })
    ])

    expect(manifest).toStrictEqual({
      entries: [{ path: '/about' }],
      sources: [listPosts],
      sourceRoutes: ['/blog/:slug'],
      dynamicRoutes: [
        { path: '/blog/:slug', isIndexable: true },
        { path: '/tags/:tag', isIndexable: true }
      ]
    })
    expect(listPosts).not.toHaveBeenCalled()
    expect(listStatic).not.toHaveBeenCalled()
  })

  it('ignores the source under noindex, its own or inherited, and respects the child that turns it back on', () => {
    const own = vi.fn<() => never[]>(() => [])
    const inherited = vi.fn<() => never[]>(() => [])
    const reactivated = vi.fn<() => never[]>(() => [])
    const manifest = collectSitemapEntries([
      page({
        path: '/drafts/:id',
        info: { seo: { noindex: true }, sitemap: own }
      }),
      page({
        path: '/private',
        info: { seo: { noindex: true } },
        children: [
          page({ path: '/:id', info: { sitemap: inherited } }),
          page({
            path: '/shared/:id',
            info: { seo: { noindex: false }, sitemap: reactivated }
          })
        ]
      })
    ])

    expect(manifest.sources).toStrictEqual([reactivated])
  })

  it('collects the source of a static child of a layout with a parameter', () => {
    const listUserPosts = vi.fn<() => never[]>(() => [])
    const manifest = collectSitemapEntries([
      {
        path: '/users/:id',
        children: [page({ path: '/posts', info: { sitemap: listUserPosts } })]
      }
    ])

    expect(manifest).toStrictEqual({
      entries: [],
      sources: [listUserPosts],
      sourceRoutes: ['/users/:id/posts'],
      dynamicRoutes: [{ path: '/users/:id/posts', isIndexable: true }]
    })
  })

  it('removes the layout source when the child index at the same URL declares noindex', () => {
    const listPosts = vi.fn<() => never[]>(() => [])
    const listComments = vi.fn<() => never[]>(() => [])
    const listTags = vi.fn<() => never[]>(() => [])
    const listPrivate = vi.fn<() => never[]>(() => [])
    const manifest = collectSitemapEntries([
      page({
        path: '/blog/:slug',
        info: { sitemap: listPosts },
        children: [
          page({ path: '/', info: { seo: { noindex: true } } }),
          page({ path: '/comments', info: { sitemap: listComments } })
        ]
      }),
      page({
        path: '/tags/:tag',
        info: { sitemap: listTags },
        children: [
          page({
            path: '/private',
            info: { seo: { noindex: true }, sitemap: listPrivate }
          })
        ]
      })
    ])

    expect(manifest.sources).toStrictEqual([listComments, listTags])
  })

  it('replaces the layout source with the one of the child index and inherits the layout one without a declaration', () => {
    const listPosts = vi.fn<() => never[]>(() => [])
    const listIndexPosts = vi.fn<() => never[]>(() => [])
    const listTags = vi.fn<() => never[]>(() => [])
    const manifest = collectSitemapEntries([
      page({
        path: '/blog/:slug',
        info: { sitemap: listPosts },
        children: [page({ path: '/', info: { sitemap: listIndexPosts } })]
      }),
      page({
        path: '/tags/:tag',
        info: { sitemap: listTags },
        children: [page({ path: '/' })]
      })
    ])

    expect(manifest.sources).toStrictEqual([listIndexPosts, listTags])
  })

  it('publishes the layout source with noindex when the child index turns the page back on', () => {
    const listDrafts = vi.fn<() => never[]>(() => [])
    const manifest = collectSitemapEntries([
      page({
        path: '/drafts/:id',
        info: { seo: { noindex: true }, sitemap: listDrafts },
        children: [page({ path: '/', info: { seo: { noindex: false } } })]
      })
    ])

    expect(manifest.sources).toStrictEqual([listDrafts])
  })
})
