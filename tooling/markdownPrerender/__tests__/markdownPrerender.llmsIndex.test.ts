import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildLlmsText } from '../../../src/routes/(seo)/llms.txt/helpers/buildLlmsText/index.ts'
import { readLlmsIndex } from '../helpers/readLlmsIndex/index.ts'

const SITE_URL = 'https://example.com/'

describe('leitura do índice llms.txt', () => {
  it('lê título, descrição e todos os links no formato do buildLlmsText', () => {
    const text = buildLlmsText({
      title: 'Site [beta]',
      description: 'A `site` with \\ backslash',
      notes: ['See [docs](https://example.com/docs) and - [x](y)'],
      siteUrl: SITE_URL,
      pages: [
        {
          path: '/en/a (b).md',
          title: 'Title [x] <y> \\ `z`',
          description: 'Uses [brackets] and `code`',
          section: 'Pages',
          isOptional: false
        },
        {
          path: '/en/search?q=a%20b#results',
          title: 'Search',
          description: '',
          section: 'Pages',
          isOptional: false
        },
        {
          path: 'https://github.com/example/repo',
          title: 'Repository',
          description: 'External',
          section: 'Optional',
          isOptional: true
        }
      ]
    })
    assert.deepEqual(readLlmsIndex(text), {
      title: String.raw`Site \[beta\]`,
      description: String.raw`A \`site\` with \\ backslash`,
      links: [
        {
          label: 'Title [x] <y> \\ `z`',
          href: 'https://example.com/en/a%20%28b%29.md',
          summary: 'Uses [brackets] and `code`'
        },
        {
          label: 'Search',
          href: 'https://example.com/en/search?q=a%20b#results',
          summary: ''
        },
        {
          label: 'Repository',
          href: 'https://github.com/example/repo',
          summary: 'External'
        }
      ]
    })
  })

  it('falha sem título e aceita um índice sem links', () => {
    assert.throws(() => readLlmsIndex('no title'), /llms\.txt has no title/u)
    assert.deepEqual(readLlmsIndex('# Site\n'), {
      title: 'Site',
      description: '',
      links: []
    })
  })
})
