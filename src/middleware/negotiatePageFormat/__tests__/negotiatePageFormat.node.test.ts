import { negotiatePageFormat } from '../index.ts'

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
    ['text/markdown;charset=utf-8;q=0.9, text/html;q=0.5', 'markdown']
  ])('selects %s as %s', (accept, expected) => {
    expect(negotiatePageFormat(accept)).toBe(expected)
  })
})
