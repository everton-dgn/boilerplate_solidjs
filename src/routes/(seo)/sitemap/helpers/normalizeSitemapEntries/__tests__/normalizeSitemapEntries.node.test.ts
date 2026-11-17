import type { SitemapEntry } from '@/@types/sitemap.ts'

import { SITEMAP_URL_LIMIT } from '../../../constants.ts'
import { normalizeSitemapEntries } from '../index.ts'

const SITE_URL = 'https://example.com'

function normalize(entries: readonly SitemapEntry[]): SitemapEntry[] {
  return normalizeSitemapEntries({ entries, siteUrl: SITE_URL })
}

describe('sitemap entry normalization', () => {
  it('keeps site paths and normalizes the slashes like the manifest', () => {
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
  ])('rejects the path %j', path => {
    expect(() => normalize([{ path }])).toThrow('Invalid sitemap path')
  })

  it('deduplicates by the normalized path, keeping the first occurrence', () => {
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
  ])('accepts lastmod %s in W3C Datetime', lastmod => {
    expect(normalize([{ path: '/', lastmod }])).toStrictEqual([
      { path: '/', lastmod }
    ])
  })

  it.each([
    'yesterday',
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
  ])('leaves out lastmod %j outside the format or impossible', lastmod => {
    expect(normalize([{ path: '/', lastmod }])).toStrictEqual([{ path: '/' }])
  })

  // The XML receives the resolved and localized URL: different paths that become
  // the same URL would repeat the same entries in every locale.
  it.each([
    ['/b', '/a/../b'],
    ['/a/../b', '/b'],
    ['/caf%C3%A9', '/café'],
    ['/café', '/caf%C3%A9'],
    ['/blog/x', '/pt/blog/x'],
    ['/pt/blog/x', '/blog/x'],
    ['/es/blog/x', '/en/blog/x']
  ])(
    'deduplicates %s and %s by the localized URL, keeping the first',
    (first, repeated) => {
      expect(
        normalize([
          { path: first, lastmod: '2026-09-01' },
          { path: repeated, lastmod: '2026-09-21' }
        ])
      ).toStrictEqual([{ path: first, lastmod: '2026-09-01' }])
    }
  )

  it('keeps paths that resolve to different URLs', () => {
    const entries = [
      { path: '/blog/x' },
      { path: '/blog/y' },
      { path: '/blog' }
    ]

    expect(normalize(entries)).toStrictEqual(entries)
  })

  // The URL limit is checked in the response, after the localization.
  it('does not limit the number of entries before the localization', () => {
    const count = SITEMAP_URL_LIMIT + 1
    const entries = Array.from({ length: count }, (_, index) => ({
      path: `/page-${index}`
    }))

    expect(normalize(entries)).toHaveLength(count)
  })
})
