import type { RouteDefinition } from '@solidjs/router'

import { matchSitemapRoute } from '../index.ts'

const filtered: RouteDefinition = {
  matchFilters: { slug: /^ok$/u }
}

describe('rota efetiva do sitemap', () => {
  const matchRoute = matchSitemapRoute([
    {
      path: '/blog/:slug?',
      page: true,
      $$route: { require: () => ({ route: filtered }) }
    },
    { path: '/café/:slug', page: true },
    { path: '/blog/static', page: true }
  ])

  it('preserva a identidade original de parâmetro opcional', () => {
    expect(matchRoute('/blog')).toBe('/blog/:slug?')
    expect(matchRoute('/blog/ok')).toBe('/blog/:slug?')
  })

  it('aplica filtros e precedência da rota estática', () => {
    expect(matchRoute('/blog/rejeitado')).toBeUndefined()
    expect(matchRoute('/blog/static')).toBe('/blog/static')
  })

  it('aceita Unicode e prefixo localizado', () => {
    expect(matchRoute('/caf%C3%A9/post')).toBe('/café/:slug')
    expect(matchRoute('/pt/caf%C3%A9/post')).toBe('/café/:slug')
    expect(matchRoute('/pt/blog/ok')).toBe('/blog/:slug?')
  })
})
