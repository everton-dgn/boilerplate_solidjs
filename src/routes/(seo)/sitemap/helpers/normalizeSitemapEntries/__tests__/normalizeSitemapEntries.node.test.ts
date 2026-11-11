import type { SitemapEntry } from '@/@types/sitemap.ts'

import { SITEMAP_URL_LIMIT } from '../../../constants.ts'
import { normalizeSitemapEntries } from '../index.ts'

const SITE_URL = 'https://example.com'

function normalize(entries: readonly SitemapEntry[]): SitemapEntry[] {
  return normalizeSitemapEntries({ entries, siteUrl: SITE_URL })
}

describe('normalização das entradas do sitemap', () => {
  it('mantém caminhos do site e normaliza as barras como o manifesto', () => {
    const entries = normalize([
      { path: '/' },
      { path: '/docs/' },
      { path: '/a//b//' },
      { path: '/café' }
    ])

    expect(entries).toStrictEqual([
      { path: '/' },
      { path: '/docs' },
      { path: '/a/b' },
      { path: '/café' }
    ])
  })

  it.each([
    'docs',
    '',
    '//evil.test/x',
    'https://evil.test/x',
    'data:text/plain,x',
    '/a?b=1',
    '/a#topo',
    String.raw`/a\b`,
    '/a b'
  ])('rejeita o caminho %j', path => {
    expect(() => normalize([{ path }])).toThrow(
      'Caminho inválido para o sitemap'
    )
  })

  it('deduplica pelo caminho normalizado, mantendo a primeira ocorrência', () => {
    const entries = normalize([
      { path: '/docs', lastmod: '2026-09-01' },
      { path: '/docs/', lastmod: '2026-09-21' },
      { path: '/docs' }
    ])

    expect(entries).toStrictEqual([{ path: '/docs', lastmod: '2026-09-01' }])
  })

  it.each([
    '2026-09-21',
    '2024-02-29',
    '2000-02-29',
    '0096-02-29',
    '2024-02-29T23:30:00-03:00',
    '2026-03-01T00:30:00+14:00',
    '2026-09-21T10:00Z',
    '2026-09-21T10:00:00Z',
    '2026-09-21T10:00:00.5-03:00'
  ])('aceita lastmod %s em W3C Datetime', lastmod => {
    expect(normalize([{ path: '/', lastmod }])).toStrictEqual([
      { path: '/', lastmod }
    ])
  })

  it.each([
    'ontem',
    '21/09/2026',
    '2026-13-45',
    '0001-01-32',
    '2026-02-30',
    '2025-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-02-30T10:00:00Z',
    '2025-02-29T23:30:00-03:00',
    '2026-09-21T10:00:00',
    '2026-09-21 10:00:00Z'
  ])('omite lastmod %j fora do formato ou impossível', lastmod => {
    expect(normalize([{ path: '/', lastmod }])).toStrictEqual([{ path: '/' }])
  })

  // O XML recebe a URL resolvida e localizada: caminhos diferentes que viram a
  // mesma URL repetiriam as mesmas entradas em todos os idiomas.
  it.each([
    ['/b', '/a/../b'],
    ['/a/../b', '/b'],
    ['/caf%C3%A9', '/café'],
    ['/café', '/caf%C3%A9'],
    ['/blog/x', '/pt/blog/x'],
    ['/pt/blog/x', '/blog/x'],
    ['/es/blog/x', '/en/blog/x']
  ])(
    'deduplica %s e %s pela URL localizada, mantendo a primeira',
    (first, repeated) => {
      expect(
        normalize([
          { path: first, lastmod: '2026-09-01' },
          { path: repeated, lastmod: '2026-09-21' }
        ])
      ).toStrictEqual([{ path: first, lastmod: '2026-09-01' }])
    }
  )

  it('mantém caminhos que resolvem para URLs diferentes', () => {
    const entries = [
      { path: '/blog/x' },
      { path: '/blog/y' },
      { path: '/blog' }
    ]

    expect(normalize(entries)).toStrictEqual(entries)
  })

  // O limite de URLs é conferido na resposta, depois da localização.
  it('não limita a quantidade de entradas antes da localização', () => {
    const count = SITEMAP_URL_LIMIT + 1
    const entries = Array.from({ length: count }, (_, index) => ({
      path: `/page-${index}`
    }))

    expect(normalize(entries)).toHaveLength(count)
  })
})
