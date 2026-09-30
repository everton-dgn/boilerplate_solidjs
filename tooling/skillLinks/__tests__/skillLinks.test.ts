/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
/* oxlint-disable node/no-sync -- As fixtures ficam num diretório temporário isolado. */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { checkMarkdownLinks, extractAnchors, githubSlug } from '../index.ts'

// Cria uma skill isolada com os arquivos informados e devolve as mensagens.
async function check(files: Record<string, string>): Promise<string[]> {
  const root = mkdtempSync(path.join(tmpdir(), 'skill-links-'))
  try {
    for (const [file, content] of Object.entries(files)) {
      const absolute = path.join(root, file)
      mkdirSync(path.dirname(absolute), { recursive: true })
      writeFileSync(absolute, content)
    }
    const diagnostics = await checkMarkdownLinks({ directory: root, root })
    return diagnostics.map(
      diagnostic =>
        `${diagnostic.file}:${diagnostic.line} ${diagnostic.message}`
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('githubSlug', () => {
  it('preserva acentos e remove pontuação como o GitHub', () => {
    assert.equal(
      githubSlug('R07: textContent perde o zero numérico no HTML de SSR'),
      'r07-textcontent-perde-o-zero-numérico-no-html-de-ssr'
    )
  })

  it('não colapsa hífens gerados por pontuação entre espaços', () => {
    assert.equal(
      githubSlug('Loading, Errored e Reveal'),
      'loading-errored-e-reveal'
    )
    assert.equal(githubSlug('a — b'), 'a--b')
  })
})

describe('extractAnchors', () => {
  it('usa o texto do código inline e numera headings repetidos', () => {
    const anchors = extractAnchors(
      [
        '---',
        '# não é heading: frontmatter',
        '---',
        '## `vi.resetModules` e instâncias',
        '## Exemplo',
        '## Exemplo',
        '```md',
        '## Dentro do bloco',
        '```',
        '<a id="Âncora-Manual"></a>'
      ].join('\n')
    )
    assert.deepEqual([...anchors].toSorted(), [
      'exemplo',
      'exemplo-1',
      'viresetmodules-e-instâncias',
      'âncora-manual'
    ])
  })
})

describe('checkMarkdownLinks', () => {
  it('aceita link relativo para arquivo e âncora existentes', async () => {
    const messages = await check({
      'SKILL.md':
        '[Guia](references/guide.md#configuração) e [topo](#skill)\n\n# Skill\n',
      'references/guide.md': '# Guia\n\n## Configuração\n'
    })
    assert.deepEqual(messages, [])
  })

  it('aponta link para arquivo inexistente', async () => {
    const messages = await check({
      'SKILL.md': '# Skill\n\nVeja [antigo](references/old-name.md).\n'
    })
    assert.deepEqual(messages, [
      'SKILL.md:3 link para arquivo inexistente: references/old-name.md'
    ])
  })

  it('aponta âncora inexistente no alvo', async () => {
    const messages = await check({
      'SKILL.md': '[Guia](guide.md#seção-renomeada)\n',
      'guide.md': '# Guia\n\n## Seção atual\n'
    })
    assert.deepEqual(messages, [
      'SKILL.md:1 âncora inexistente: guide.md#seção-renomeada'
    ])
  })

  it('resolve âncoras com acento, código inline e percent-encoding', async () => {
    const messages = await check({
      'SKILL.md': [
        '[a](risks.md#r12-ssrsource-hybrid-pode-perder-a-primeira-resposta)',
        '[b](risks.md#r09-leitura-após-escrita)',
        '[c](risks.md#r09-leitura-ap%C3%B3s-escrita)',
        '[d](risks.md#r12-ssrsource-hybrid)'
      ].join('\n'),
      'risks.md': [
        '## R12: `ssrSource: "hybrid"` pode perder a primeira resposta',
        '## R09: leitura após escrita'
      ].join('\n')
    })
    assert.deepEqual(messages, [
      'SKILL.md:4 âncora inexistente: risks.md#r12-ssrsource-hybrid'
    ])
  })

  it('ignora links externos, código inline e blocos de código', async () => {
    const messages = await check({
      'SKILL.md': [
        '[site](https://example.com/missing.md#x) [mail](mailto:a@b.c)',
        'Use `[x](missing.md)` como exemplo.',
        '```md',
        '[y](missing.md)',
        '```'
      ].join('\n')
    })
    assert.deepEqual(messages, [])
  })

  it('verifica existência de alvos que não são Markdown', async () => {
    const messages = await check({
      'SKILL.md': '[ok](examples/tasks.tsx) [falta](examples/removed.tsx)\n',
      'examples/tasks.tsx': 'export {}\n'
    })
    assert.deepEqual(messages, [
      'SKILL.md:1 link para arquivo inexistente: examples/removed.tsx'
    ])
  })
})
