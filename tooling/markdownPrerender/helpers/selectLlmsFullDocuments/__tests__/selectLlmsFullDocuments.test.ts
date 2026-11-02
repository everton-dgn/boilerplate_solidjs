import assert from 'node:assert/strict'
import { it } from 'node:test'

import { selectLlmsFullDocuments } from '../index.ts'

const SITE_URL = 'https://example.com/'

function links(hrefs: string[]) {
  return hrefs.map(href => ({ label: 'Page', href, summary: '' }))
}

it('inclui cada .md estático uma vez, na ordem do primeiro link', () => {
  const result = selectLlmsFullDocuments({
    links: links([
      'https://example.com/en/index.md',
      'https://example.com/en/about.md',
      'https://example.com/en/index.md',
      'https://example.com/en/about.md#team',
      'https://example.com/en/caf%C3%A9.md'
    ]),
    siteUrl: SITE_URL,
    inventory: new Set(['/en/about.md', '/en/index.md', '/en/café.md']),
    baseLocalePaths: new Set(['/en/about.md', '/en/index.md', '/en/café.md']),
    ownPaths: new Set()
  })
  assert.deepEqual(result, {
    documents: [
      { url: 'https://example.com/en/index.md', path: '/en/index.md' },
      { url: 'https://example.com/en/about.md', path: '/en/about.md' },
      { url: 'https://example.com/en/caf%C3%A9.md', path: '/en/café.md' }
    ],
    omitted: []
  })
})

it('declara os links fora da cobertura sem requisições e ignora os próprios índices', () => {
  const result = selectLlmsFullDocuments({
    links: links([
      'https://example.com/llms-full.txt',
      'https://example.com/en/contact',
      'https://example.com/en/blog/post.md',
      'https://example.com/en/about.md?version=2',
      'https://github.com/example/repo',
      'https://example.com:8443/en/about.md',
      'https://example.com/%E0%A4%A.md',
      'https://example.com/en/contact'
    ]),
    siteUrl: SITE_URL,
    inventory: new Set(['/en/about.md']),
    baseLocalePaths: new Set(['/en/about.md']),
    ownPaths: new Set(['/llms-full.txt'])
  })
  assert.deepEqual(result, {
    documents: [],
    omitted: [
      {
        url: 'https://example.com/en/contact',
        reason: 'HTML page without Markdown'
      },
      {
        url: 'https://example.com/en/blog/post.md',
        reason: 'Markdown generated on request'
      },
      {
        url: 'https://example.com/en/about.md?version=2',
        reason: 'URL with query, served on request'
      },
      { url: 'https://github.com/example/repo', reason: 'external link' },
      { url: 'https://example.com:8443/en/about.md', reason: 'external link' },
      { url: 'https://example.com/%E0%A4%A.md', reason: 'invalid URL' }
    ]
  })
})

it('declara um .md estático de outro idioma em vez de incluí-lo', () => {
  const result = selectLlmsFullDocuments({
    links: links([
      'https://example.com/pt/sobre.md',
      'https://example.com/en/about.md',
      'https://example.com/pt/sobre.md#equipe'
    ]),
    siteUrl: SITE_URL,
    inventory: new Set(['/en/about.md', '/pt/sobre.md']),
    baseLocalePaths: new Set(['/en/about.md']),
    ownPaths: new Set()
  })
  assert.deepEqual(result, {
    documents: [
      { url: 'https://example.com/en/about.md', path: '/en/about.md' }
    ],
    omitted: [
      {
        url: 'https://example.com/pt/sobre.md',
        reason: 'page in another language'
      },
      {
        url: 'https://example.com/pt/sobre.md#equipe',
        reason: 'page in another language'
      }
    ]
  })
})
