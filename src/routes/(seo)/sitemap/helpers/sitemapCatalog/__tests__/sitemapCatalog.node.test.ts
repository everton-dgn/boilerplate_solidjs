import { createDirectCatalog } from '../index.ts'

type MockSitemapConstants = {
  SITEMAP_URL_LIMIT: number
}

vi.mock<MockSitemapConstants>(
  import('../../../constants.ts'),
  async importOriginal => {
    const actual = await importOriginal()
    return { ...actual, SITEMAP_URL_LIMIT: 2 }
  }
)

describe('catálogo direto de sitemap', () => {
  it('recusa um grupo de idiomas maior que a parte sem criar uma parte vazia', async () => {
    const options = {
      siteUrl: 'https://example.com',
      byteBudget: 65_536
    }
    const empty = createDirectCatalog({
      ...options,
      manifest: { entries: [], sources: [] }
    })
    await expect(empty.readSummary()).resolves.toStrictEqual({
      partCount: 0,
      isFileRoot: false
    })
    const oversized = createDirectCatalog({
      ...options,
      manifest: { entries: [{ path: '/page' }], sources: [] }
    })
    expect(() => oversized.readSummary()).toThrow(
      'Grupo de idiomas excede limite'
    )
  })
})
