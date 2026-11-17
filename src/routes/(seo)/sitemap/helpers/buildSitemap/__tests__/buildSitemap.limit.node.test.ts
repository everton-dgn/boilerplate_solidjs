import { buildSitemap } from '../index.ts'

const MANY_ENTRIES = 400
const LONG_SEGMENT = 1000
const LATE_INDEX = MANY_ENTRIES - 1

describe('bounded XML building', () => {
  it('stops the urlset before reaching a group past the budget', () => {
    const entries = Array.from({ length: MANY_ENTRIES }, (_, index) => ({
      path: `/post-${index}-${'a'.repeat(LONG_SEGMENT)}`
    }))
    Object.defineProperty(entries[LATE_INDEX], 'path', {
      get: () => {
        throw new Error('Later group accessed')
      }
    })
    expect(() =>
      buildSitemap({
        entries,
        siteUrl: 'https://example.com',
        byteBudget: 100_000
      })
    ).toThrow('Sitemap exceeds the byte limit')
  })
})
