import { createSitemapIndexBuilder } from '../index.ts'

const MANY_ENTRIES = 400
const LONG_SEGMENT = 1000
const LATE_INDEX = MANY_ENTRIES - 1

describe('construção incremental do índice', () => {
  const BYTE_BUDGET = 20_000

  it('interrompe índice antes de acessar descritor posterior ao orçamento', () => {
    const locations = Array.from(
      { length: MANY_ENTRIES },
      (_, index) => `https://example.com/${index}-${'a'.repeat(LONG_SEGMENT)}`
    )
    Object.defineProperty(locations, LATE_INDEX, {
      get: () => {
        throw new Error('Descritor posterior acessado')
      }
    })
    const builder = createSitemapIndexBuilder(BYTE_BUDGET)
    expect(() => {
      for (const location of locations) builder.add(location)
    }).toThrow('Índice excede limite de bytes')
  })
})
