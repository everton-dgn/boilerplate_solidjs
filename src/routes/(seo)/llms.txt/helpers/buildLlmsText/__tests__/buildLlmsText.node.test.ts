import type { LlmsPage } from '../../../types.ts'
import { buildLlmsText } from '../index.ts'

type PageOverrides = Partial<LlmsPage> & Pick<LlmsPage, 'path'>

function page(overrides: PageOverrides): LlmsPage {
  return {
    title: overrides.path,
    description: '',
    section: 'Pages',
    isOptional: false,
    ...overrides
  }
}

describe('llms.txt generation', () => {
  it('publishes the title, the summary and the list of pages with absolute URLs', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Site summary.',
      pages: [page({ path: '/' }), page({ path: '/docs' })],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(
      [
        '# Site',
        '',
        '> Site summary.',
        '',
        '## Pages',
        '',
        '- [/](https://example.com/)',
        '- [/docs](https://example.com/docs)',
        ''
      ].join('\n')
    )
  })

  it('publishes the notes as a list between the summary and the sections, skipping the empty ones', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Site summary.',
      notes: ['Content in Portuguese.', ' \n ', 'No [public] API\nfor now.'],
      pages: [page({ path: '/', title: 'Home' })],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(
      [
        '# Site',
        '',
        '> Site summary.',
        '',
        '- Content in Portuguese.',
        String.raw`- No \[public\] API for now.`,
        '',
        '## Pages',
        '',
        '- [Home](https://example.com/)',
        ''
      ].join('\n')
    )
  })

  it('leaves out the notes block when all of them are blank', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Site summary.',
      notes: ['', '  '],
      pages: [],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(['# Site', '', '> Site summary.', ''].join('\n'))
  })

  it('publishes only the header when no page was selected', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Site summary.',
      pages: [],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(['# Site', '', '> Site summary.', ''].join('\n'))
  })

  it('groups by section in the order of the manifest and publishes the optional ones last', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Site summary.',
      pages: [
        page({ path: '/', title: 'Home', description: 'Introduction.' }),
        page({ path: '/docs/a', title: 'A', section: 'Guides' }),
        page({ path: '/changelog', title: 'Changelog', isOptional: true }),
        page({ path: '/about', title: 'About' }),
        page({
          path: '/docs/b',
          title: 'B',
          section: 'Guides',
          isOptional: true
        })
      ],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(
      [
        '# Site',
        '',
        '> Site summary.',
        '',
        '## Pages',
        '',
        '- [Home](https://example.com/): Introduction.',
        '- [About](https://example.com/about)',
        '',
        '## Guides',
        '',
        '- [A](https://example.com/docs/a)',
        '',
        '## Optional',
        '',
        '- [Changelog](https://example.com/changelog)',
        '- [B](https://example.com/docs/b)',
        ''
      ].join('\n')
    )
  })

  it('escapes only what breaks the structure and keeps the rest readable', () => {
    const text = buildLlmsText({
      title: 'Site [beta]\nTitle',
      description: 'Summary\nwith *emphasis* and <tags>.',
      pages: [
        page({
          path: '/docs(v2)',
          title: 'Guide [v2]\r\nExamples',
          description: 'Use `code`\nwith _care_.',
          section: 'C++ [API]'
        })
      ],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(
      [
        String.raw`# Site \[beta\] Title`,
        '',
        '> Summary with *emphasis* and <tags>.',
        '',
        String.raw`## C++ \[API\]`,
        '',
        '- [Guide \\[v2\\] Examples](https://example.com/docs%28v2%29): Use \\`code\\` with _care_.',
        ''
      ].join('\n')
    )
  })

  it('keeps backticks and autolinks in the label from swallowing the end of the link', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Summary.',
      pages: [
        page({
          path: '/guide',
          title: 'How to use `',
          description: 'The ` character opens code.'
        }),
        page({ path: '/types', title: 'List<T> and <https://x.test>' })
      ],
      siteUrl: 'https://example.com'
    })

    expect(text).toContain(
      '- [How to use \\`](https://example.com/guide): The \\` character opens code.\n'
    )
    expect(text).toContain(
      '- [List\\<T\\> and \\<https://x.test\\>](https://example.com/types)\n'
    )
  })

  it('merges a section called Optional into the optional bucket, always last', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Summary.',
      pages: [
        page({ path: '/a', title: 'A', section: 'Optional' }),
        page({ path: '/b', title: 'B', section: 'Guides' }),
        page({ path: '/c', title: 'C', isOptional: true })
      ],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(
      [
        '# Site',
        '',
        '> Summary.',
        '',
        '## Guides',
        '',
        '- [B](https://example.com/b)',
        '',
        '## Optional',
        '',
        '- [A](https://example.com/a)',
        '- [C](https://example.com/c)',
        ''
      ].join('\n')
    )
  })

  it('leaves out the separator when the description of the page is blank', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Site summary.',
      pages: [page({ path: '/', title: 'Home', description: ' \n ' })],
      siteUrl: 'https://example.com'
    })

    expect(text).toContain('- [Home](https://example.com/)\n')
    expect(text).not.toContain('):')
  })
})

describe('usage guidance in llms.txt', () => {
  it('keeps the links by purpose before the index even when they repeat a URL', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Summary.',
      pages: [
        page({
          path: '/',
          title: 'Evaluate the template',
          description:
            'Inspect the rendered homepage before selecting the template.',
          section: 'When to use'
        }),
        page({ path: '/', title: 'Home' })
      ],
      siteUrl: 'https://example.com'
    })

    expect(text).toContain(
      '## When to use\n\n- [Evaluate the template](https://example.com/): Inspect the rendered homepage before selecting the template.\n\n## Pages\n\n- [Home](https://example.com/)\n'
    )
  })
})
