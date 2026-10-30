import { hasMarkdownOptIn, isMarkdownRoute, markdownPath } from '../index.ts'

describe('HTML-derived Markdown', () => {
  it('requires an explicit leaf opt-in and effective indexable SEO', () => {
    expect(isMarkdownRoute([{ markdown: true }, {}])).toBe(false)
    expect(
      isMarkdownRoute([{ seo: { noindex: true } }, { markdown: true }])
    ).toBe(false)
    expect(
      isMarkdownRoute([
        { seo: { noindex: true } },
        { markdown: true, seo: { noindex: false } }
      ])
    ).toBe(true)
    expect(isMarkdownRoute([{ markdown: true, seo: { noindex: true } }])).toBe(
      false
    )
  })

  it('publishes dynamic pages under the same SEO rule', () => {
    expect(isMarkdownRoute([{ markdown: 'dynamic' }])).toBe(true)
    expect(
      isMarkdownRoute([{ markdown: 'dynamic', seo: { noindex: true } }])
    ).toBe(false)
    expect(isMarkdownRoute([{ markdown: false }])).toBe(false)
  })

  it('reads the opt-in from the leaf without resolving SEO', () => {
    expect(hasMarkdownOptIn([{ markdown: true, seo: { noindex: true } }])).toBe(
      true
    )
    expect(hasMarkdownOptIn([{ markdown: 'dynamic' }])).toBe(true)
    expect(hasMarkdownOptIn([{ markdown: true }, {}])).toBe(false)
    expect(hasMarkdownOptIn([{ markdown: false }])).toBe(false)
    expect(hasMarkdownOptIn([])).toBe(false)
  })

  it.each([
    ['/', '/index.md'],
    ['/pt', '/pt/index.md'],
    ['/en/', '/en/index.md'],
    ['/index', '/index/index.md'],
    ['/index/index', '/index/index/index.md'],
    ['/foo/index', '/foo/index/index.md'],
    ['/pt/index', '/pt/index/index.md'],
    ['/en/index/', '/en/index/index.md'],
    ['/es/foo/index', '/es/foo/index/index.md'],
    ['/pt/index/index', '/pt/index/index/index.md'],
    ['/es/about', '/es/about.md'],
    ['/pt/blog/article', '/pt/blog/article.md']
  ])('maps %s to %s', (path, expected) => {
    expect(markdownPath(path)).toBe(expected)
  })
})
