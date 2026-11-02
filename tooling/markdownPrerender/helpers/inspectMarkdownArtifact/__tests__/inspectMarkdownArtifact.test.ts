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

it('aceita páginas curtas, HTML em código e texto que cita marcação', () => {
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

it('aceita o tipo Markdown com charset UTF-8 em qualquer grafia', () => {
  for (const contentType of [
    'text/markdown;charset=utf-8',
    'Text/Markdown; Charset="UTF-8"',
    'text/markdown; variant=GFM; charset=utf-8'
  ]) {
    assert.equal(inspectMarkdownArtifact(artifact({ contentType })), undefined)
  }
})

it('lê os bytes gravados em vez do texto já decodificado', () => {
  const data = new TextEncoder().encode('# Olá').buffer
  assert.equal(
    inspectMarkdownArtifact(artifact({ contents: undefined, data })),
    undefined
  )
})

it('recusa HTML gravado como .md.html para a URL .md', () => {
  assert.equal(
    inspectMarkdownArtifact(artifact({ fileName: '/en/about.md.html' })),
    'written as /en/about.md.html'
  )
  assert.equal(
    inspectMarkdownArtifact(artifact({ fileName: undefined })),
    'written as no file'
  )
})

it('recusa tipos que não sejam Markdown UTF-8 declarado pela resposta', () => {
  for (const [contentType, problem] of [
    ['text/html; charset=utf-8', 'served as text/html; charset=utf-8'],
    // Tipo inferido pelo Nitro quando a resposta não declara nenhum, como num
    // redirect sem corpo.
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

it('recusa corpo vazio, só espaços ou ausente', () => {
  for (const contents of ['', ' \n\t ', undefined]) {
    assert.equal(inspectMarkdownArtifact(artifact({ contents })), 'empty body')
  }
})

it('recusa bytes que não são UTF-8 válido', () => {
  // Byte de continuação isolado e sequência multibyte truncada no fim.
  for (const hex of ['ff23', '2320c3']) {
    const data = new Uint8Array(Buffer.from(hex, 'hex')).buffer
    assert.equal(
      inspectMarkdownArtifact(artifact({ contents: undefined, data })),
      'invalid UTF-8 body'
    )
  }
})

it('recusa um documento HTML inteiro mesmo com o tipo Markdown', () => {
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
