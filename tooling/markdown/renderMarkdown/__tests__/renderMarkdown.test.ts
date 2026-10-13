/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { SitePage } from '@/@types/site-page.ts'

import { renderMarkdown } from '../index.ts'

const PAGE: SitePage = {
  title: 'A public page',
  description: 'Description',
  intro: 'Introduction',
  sections: [],
  links: []
}

describe('Markdown serialization', () => {
  it('escapes user text without exposing HTML or additional Markdown headings', () => {
    const body = renderMarkdown({
      ...PAGE,
      intro: '<script>alert(1)</script>\n# injected\n===',
      links: [{ label: '[label]', href: '/en/about' }]
    })
    assert.equal(body.includes('<script>'), false)
    assert.equal(body.includes('\n# injected'), false)
    assert.equal(body.includes('\n==='), false)
    assert.equal(body.includes('](</en/about>)'), true)
  })

  it('rejects executable URLs, credentials, malformed destinations and text controls', () => {
    for (const href of [
      // oxlint-disable-next-line eslint/no-script-url -- Destino malicioso para a regressão do serializador.
      'javascript:alert(1)',
      'data:text/html,hello',
      '//evil.test',
      'https://user:secret@example.com',
      'https://example.com>\n# injected',
      String.raw`/a\b`
    ]) {
      assert.throws(
        () => renderMarkdown({ ...PAGE, links: [{ label: 'link', href }] }),
        /Markdown links/u
      )
    }
    assert.throws(
      () =>
        renderMarkdown({ ...PAGE, intro: `text${String.fromCodePoint(0)}` }),
      /control characters/u
    )
    assert.throws(
      () => renderMarkdown({ ...PAGE, title: 'first\nsecond' }),
      /single line/u
    )
  })

  it('preserves readable Unicode and permits public links', () => {
    const body = renderMarkdown({
      ...PAGE,
      title: 'Ação e informação',
      links: [
        { label: 'Support', href: 'mailto:help@example.com' },
        { label: 'Source', href: 'https://example.com/docs?a=1&b=2' }
      ]
    })
    assert.equal(body.startsWith('# Ação e informação\n'), true)
    assert.equal(body.includes('mailto:help@example.com'), true)
    assert.equal(body.includes('https://example.com/docs?a=1&b=2'), true)
  })
})
