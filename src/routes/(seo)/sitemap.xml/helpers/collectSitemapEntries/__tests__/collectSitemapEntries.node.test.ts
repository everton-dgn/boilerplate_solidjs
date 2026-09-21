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

describe('coleta das páginas estáticas', () => {
  it('lista só páginas estáticas, com aninhamento e sem duplicatas', () => {
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
          { path: '/guia', page: true },
          { path: '/:slug', page: true }
        ]
      }
    ])

    expect(manifest).toStrictEqual({
      entries: [{ path: '/' }, { path: '/docs' }, { path: '/docs/guia' }],
      sources: []
    })
  })

  it('consulta só noindex, tipo e datas, sem ler título e descrição nem executar preload', () => {
    const preload = vi.fn<() => void>()
    const manifest = collectSitemapEntries([
      page({
        path: '/docs',
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

  it('herda noindex e permite que uma filha se torne indexável explicitamente', () => {
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

describe('lastmod das páginas estáticas', () => {
  it('publica lastmod só em artigo, preferindo a data de alteração', () => {
    const manifest = collectSitemapEntries([
      page({
        path: '/artigo',
        info: {
          seo: {
            type: 'article',
            article: { datePublished: '2026-09-01', dateModified: '2026-09-21' }
          }
        }
      }),
      page({
        path: '/novo',
        info: {
          seo: { type: 'article', article: { datePublished: '2026-09-01' } }
        }
      }),
      page({
        path: '/institucional',
        info: {
          seo: {
            type: 'website',
            article: { datePublished: '2026-09-01', dateModified: '2026-09-21' }
          }
        }
      }),
      page({ path: '/sem-data', info: { seo: { type: 'article' } } })
    ])

    expect(manifest.entries).toStrictEqual([
      { path: '/artigo', lastmod: '2026-09-21' },
      { path: '/novo', lastmod: '2026-09-01' },
      { path: '/institucional' },
      { path: '/sem-data' }
    ])
  })

  it('herda tipo e datas do layout e deixa a filha sobrescrever só o que declara', () => {
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
          page({ path: '/guia' }),
          page({ path: '/site', info: { seo: { type: 'website' } } })
        ]
      })
    ])

    expect(manifest.entries).toStrictEqual([
      { path: '/docs', lastmod: '2026-09-21' },
      { path: '/docs/guia', lastmod: '2026-09-01' },
      { path: '/docs/site' }
    ])
  })
})

describe('fontes das rotas com parâmetro', () => {
  it('coleta as fontes das páginas com parâmetro sem executá-las', () => {
    const listPosts = vi.fn<() => never[]>(() => [])
    const listStatic = vi.fn<() => never[]>(() => [])
    const manifest = collectSitemapEntries([
      page({ path: '/blog/:slug', info: { sitemap: listPosts } }),
      page({ path: '/tags/:tag' }),
      page({ path: '/sobre', info: { sitemap: listStatic } }),
      page({ path: '/api/:id', page: false, info: { sitemap: listStatic } })
    ])

    expect(manifest).toStrictEqual({
      entries: [{ path: '/sobre' }],
      sources: [listPosts]
    })
    expect(listPosts).not.toHaveBeenCalled()
    expect(listStatic).not.toHaveBeenCalled()
  })

  it('ignora a fonte sob noindex, próprio ou herdado, e respeita a filha que reativa', () => {
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

  it('coleta a fonte de uma filha estática de layout com parâmetro', () => {
    const listUserPosts = vi.fn<() => never[]>(() => [])
    const manifest = collectSitemapEntries([
      {
        path: '/users/:id',
        children: [page({ path: '/posts', info: { sitemap: listUserPosts } })]
      }
    ])

    expect(manifest).toStrictEqual({ entries: [], sources: [listUserPosts] })
  })
})
