import { SITEMAP_URL_LIMIT } from '../../../constants.ts'
import { normalizeSitemapEntries } from '../index.ts'

describe('normalização das entradas do sitemap', () => {
  it('mantém caminhos do site e normaliza as barras como o manifesto', () => {
    const entries = normalizeSitemapEntries([
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
    expect(() => normalizeSitemapEntries([{ path }])).toThrow(
      'Caminho inválido para o sitemap'
    )
  })

  it('deduplica pelo caminho normalizado, mantendo a primeira ocorrência', () => {
    const entries = normalizeSitemapEntries([
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
    expect(normalizeSitemapEntries([{ path: '/', lastmod }])).toStrictEqual([
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
    expect(normalizeSitemapEntries([{ path: '/', lastmod }])).toStrictEqual([
      { path: '/' }
    ])
  })

  it('aceita o limite do protocolo e falha uma URL acima dele', () => {
    const atLimit = Array.from({ length: SITEMAP_URL_LIMIT }, (_, index) => ({
      path: `/page-${index}`
    }))

    expect(normalizeSitemapEntries(atLimit)).toHaveLength(SITEMAP_URL_LIMIT)
    expect(() =>
      normalizeSitemapEntries([...atLimit, { path: '/uma-a-mais' }])
    ).toThrow('acima do limite')
  })
})
