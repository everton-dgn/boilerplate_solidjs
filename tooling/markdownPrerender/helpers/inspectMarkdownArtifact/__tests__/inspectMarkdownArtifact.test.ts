import assert from 'node:assert/strict'
import { it } from 'node:test'

import type { PrerenderRoute } from 'nitro/types'

import { inspectMarkdownArtifact } from '../index.ts'

const ROUTE = '/en/about.md'
const MARKDOWN_TYPE = 'text/markdown; charset=utf-8'

function artifact(overrides: Partial<PrerenderRoute>): PrerenderRoute {
  return {
    route: ROUTE,
    fileName: ROUTE,
    contentType: MARKDOWN_TYPE,
    contents: '# About',
    ...overrides
  }
}

it('accepts short pages, HTML in code and text that quotes markup', () => {
  for (const contents of [
    '# A',
    'x',
    '# Page\n\n```html\n<!doctype html>\n<html><body data-hk="0"></body></html>\n```\n',
    '# Hydration\n\nThe `data-hk` attribute and <script> tags are explained here.',
    '<!doctype html> is the first line of every page.\n\nMore text.',
    '<html> opens the document; this page explains it.',
    '# Café\n\nÁgua, ñandú e 日本語 🚀'
  ]) {
    assert.equal(inspectMarkdownArtifact(artifact({ contents })), undefined)
  }
})

it('accepts the Markdown type with a UTF-8 charset in any spelling', () => {
  for (const contentType of [
    'text/markdown;charset=utf-8',
    'Text/Markdown; Charset="UTF-8"',
    'text/markdown; variant=GFM; charset=utf-8'
  ]) {
    assert.equal(inspectMarkdownArtifact(artifact({ contentType })), undefined)
  }
})

it('reads the written bytes instead of the already decoded text', () => {
  const data = new TextEncoder().encode('# Olá').buffer
  assert.equal(
    inspectMarkdownArtifact(artifact({ contents: undefined, data })),
    undefined
  )
})

it('refuses HTML written as .md.html for the .md URL', () => {
  assert.equal(
    inspectMarkdownArtifact(artifact({ fileName: '/en/about.md.html' })),
    'written as /en/about.md.html'
  )
  assert.equal(
    inspectMarkdownArtifact(artifact({ fileName: undefined })),
    'written as no file'
  )
})

it('refuses types other than UTF-8 Markdown declared by the response', () => {
  for (const [contentType, problem] of [
    ['text/html; charset=utf-8', 'served as text/html; charset=utf-8'],
    // Type inferred by Nitro when the response declares none, as in a redirect
    // without a body.
    ['text/markdown', 'served as text/markdown'],
    [
      'text/markdown; charset=iso-8859-1',
      'served as text/markdown; charset=iso-8859-1'
    ],
    ['text/plain; charset=utf-8', 'served as text/plain; charset=utf-8'],
    ['', 'served as no content type']
  ] as const) {
    assert.equal(inspectMarkdownArtifact(artifact({ contentType })), problem)
  }
})

it('refuses an empty, whitespace-only or missing body', () => {
  for (const contents of ['', ' \n\t ', undefined]) {
    assert.equal(inspectMarkdownArtifact(artifact({ contents })), 'empty body')
  }
})

it('refuses bytes that are not valid UTF-8', () => {
  // An isolated continuation byte and a multibyte sequence cut at the end.
  for (const hex of ['ff23', '2320c3']) {
    const data = new Uint8Array(Buffer.from(hex, 'hex')).buffer
    assert.equal(
      inspectMarkdownArtifact(artifact({ contents: undefined, data })),
      'invalid UTF-8 body'
    )
  }
})

it('refuses a whole HTML document even with the Markdown type', () => {
  for (const contents of [
    '<!DOCTYPE html><html lang="en"><body><main>About</main></body></html>',
    '\n  <html><head></head><body data-hk="0">About</body></html>\n'
  ]) {
    assert.equal(
      inspectMarkdownArtifact(artifact({ contents })),
      'HTML document body'
    )
  }
})
