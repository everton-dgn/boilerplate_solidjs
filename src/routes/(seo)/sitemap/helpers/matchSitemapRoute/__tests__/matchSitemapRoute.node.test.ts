import type { RouteDefinition } from '@solidjs/router'

import { matchSitemapRoute } from '../index.ts'

const filtered: RouteDefinition = {
  matchFilters: { slug: /^ok$/u }
}

describe('effective sitemap route', () => {
  const matchRoute = matchSitemapRoute([
    {
      path: '/blog/:slug?',
      page: true,
      $$route: { require: () => ({ route: filtered }) }
    },
    { path: '/café/:slug', page: true },
    { path: '/blog/static', page: true }
  ])

  it('keeps the original identity of an optional parameter', () => {
    expect(matchRoute('/blog')).toBe('/blog/:slug?')
    expect(matchRoute('/blog/ok')).toBe('/blog/:slug?')
  })

  it('applies filters and the precedence of the static route', () => {
    expect(matchRoute('/blog/rejeitado')).toBeUndefined()
    expect(matchRoute('/blog/static')).toBe('/blog/static')
  })

  it('accepts Unicode and a localized prefix', () => {
    expect(matchRoute('/caf%C3%A9/post')).toBe('/café/:slug')
    expect(matchRoute('/pt/caf%C3%A9/post')).toBe('/café/:slug')
    expect(matchRoute('/pt/blog/ok')).toBe('/blog/:slug?')
  })
})
