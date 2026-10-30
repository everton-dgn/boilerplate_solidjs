import { acceptsMarkdown, negotiatePageFormat } from '../index.ts'

// Com a varredura quadrática, 200 mil caracteres levavam dezenas de segundos.
const LONG_HEADER_LENGTH = 200_000
const LONG_HEADER_BUDGET_MS = 3000

describe('page representation negotiation', () => {
  it.each([
    [null, 'html'],
    ['', undefined],
    ['   ', undefined],
    ['*/*', 'html'],
    ['text/*', 'html'],
    ['text/html', 'html'],
    ['text/markdown', 'markdown'],
    ['text/markdown, */*', 'markdown'],
    ['text/markdown, text/*', 'markdown'],
    ['TEXT/MARKDOWN ; Q = 0.8', 'markdown'],
    ['text/html, text/markdown', 'html'],
    ['text/markdown, text/html', 'html'],
    ['text/markdown;q=1, text/html;q=0.5', 'markdown'],
    ['text/markdown;q=0.5, text/html;q=1', 'html'],
    ['text/markdown;q=0.5, */*;q=0.1', 'markdown'],
    ['text/markdown;q=0.2, text/*;q=0.8', 'html'],
    ['text/markdown;q=0, */*;q=1', 'html'],
    ['text/markdown;q=0', undefined],
    ['text/html;q=0, text/markdown;q=0, */*;q=1', undefined],
    ['text/html;q=0, */*;q=1', 'markdown'],
    ['text/*, text/html;q=0', 'markdown'],
    ['*/*;q=0', undefined],
    ['application/json', undefined],
    ['application/json;note="text/markdown"', undefined],
    ['text/markdown;q=1.001, text/html', 'html'],
    ['text/markdown;q=NaN', undefined],
    ['text/markdown;q=-1', undefined],
    ['text/markdown;q=0.0000', undefined],
    ['text/markdown;q=0;q=1', undefined],
    ['text/markdown;charset=utf-8', 'markdown'],
    ['text/markdown;charset="UTF-8"', 'markdown'],
    ['text/markdown;charset=iso-8859-1', undefined],
    ['text/markdown;flavor=unknown', undefined],
    ['text/markdown;note="a,b", text/html', 'html'],
    ['text/markdown;charset=utf-8;q=0, text/markdown;q=1', undefined],
    ['text/markdown;charset=utf-8;q=0.9, text/html;q=0.5', 'markdown'],
    ['text/markdown;variant=GFM', 'markdown'],
    ['text/markdown;variant="CommonMark";charset=utf-8', 'markdown'],
    ['text/markdown;variant=Original', undefined],
    ['text/markdown;variant=GFM"', undefined],
    ['text/markdown;variant="GFM', undefined],
    ['text/markdown;variant=GFM;variant=GFM', undefined],
    ['text/html;variant=GFM', undefined],
    ['text/markdown;charset=utf-8;charset=utf-8', undefined],
    [String.raw`text/markdown;note="a\",b", text/html`, 'html'],
    ['text/markdown;note="a, text/html', undefined]
  ])('selects %s as %s', (accept, expected) => {
    expect(negotiatePageFormat(accept)).toBe(expected)
  })

  it.each([
    ['vírgulas', ','.repeat(LONG_HEADER_LENGTH)],
    ['vírgulas e aspas', ',"'.repeat(LONG_HEADER_LENGTH)],
    ['parâmetros', `text/html${';'.repeat(LONG_HEADER_LENGTH)}`]
  ])('negocia um Accept longo de %s em tempo linear', (_label, accept) => {
    const start = performance.now()
    negotiatePageFormat(accept)
    acceptsMarkdown(accept)
    expect(performance.now() - start).toBeLessThan(LONG_HEADER_BUDGET_MS)
  })
})
