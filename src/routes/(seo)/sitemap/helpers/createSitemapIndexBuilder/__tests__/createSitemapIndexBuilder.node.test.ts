import { createSitemapIndexBuilder } from '../index.ts'

const MANY_ENTRIES = 400
const LONG_SEGMENT = 1000
const LATE_INDEX = MANY_ENTRIES - 1

describe('incremental index building', () => {
  const BYTE_BUDGET = 20_000

  it('stops the index before reaching a descriptor past the budget', () => {
    const locations = Array.from(
      { length: MANY_ENTRIES },
      (_, index) => `https://example.com/${index}-${'a'.repeat(LONG_SEGMENT)}`
    )
    Object.defineProperty(locations, LATE_INDEX, {
      get: () => {
        throw new Error('Later descriptor accessed')
      }
    })
    const builder = createSitemapIndexBuilder(BYTE_BUDGET)
    expect(() => {
      for (const location of locations) builder.add(location)
    }).toThrow('Index exceeds the byte limit')
  })
})
