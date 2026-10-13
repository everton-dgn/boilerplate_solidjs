/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'

import type { MarkdownArtifact } from '../../types.ts'
import { publishArtifacts } from '../index.ts'

async function sandbox(context: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'markdown-output-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  return root
}

function artifact(href: string): MarkdownArtifact {
  return {
    path: '/en/article',
    href,
    locale: 'en',
    body: '# Public content\n',
    title: 'Public content',
    description: 'Description',
    llms: { shouldInclude: true, section: 'Pages', isOptional: false }
  }
}

describe('Markdown build publication', () => {
  it('replaces the previous snapshot and removes obsolete generated files', async context => {
    const root = await sandbox(context)
    await publishArtifacts({ root, artifacts: [artifact('/en/old.md')] })
    await publishArtifacts({ root, artifacts: [artifact('/en/new.md')] })
    assert.equal(
      await readFile(path.join(root, '.markdown/public/en/new.md'), 'utf8'),
      '# Public content\n'
    )
    await assert.rejects(
      readFile(path.join(root, '.markdown/public/en/old.md')),
      /ENOENT/u
    )
  })

  it('preserves the previous snapshot when a public asset conflicts', async context => {
    const root = await sandbox(context)
    await publishArtifacts({ root, artifacts: [artifact('/en/old.md')] })
    await mkdir(path.join(root, 'public/en'), { recursive: true })
    await writeFile(path.join(root, 'public/en/new.md'), 'Authored content')
    await assert.rejects(
      publishArtifacts({ root, artifacts: [artifact('/en/new.md')] }),
      /conflicts with a public file/u
    )
    assert.equal(
      await readFile(path.join(root, '.markdown/public/en/old.md'), 'utf8'),
      '# Public content\n'
    )
    assert.equal(
      await readFile(path.join(root, 'public/en/new.md'), 'utf8'),
      'Authored content'
    )
  })

  it('writes encoded URLs as filesystem names and refuses traversal', async context => {
    const root = await sandbox(context)
    await publishArtifacts({
      root,
      artifacts: [artifact('/en/a%C3%A7%C3%A3o.md')]
    })
    assert.equal(
      await readFile(path.join(root, '.markdown/public/en/ação.md'), 'utf8'),
      '# Public content\n'
    )
    await assert.rejects(
      publishArtifacts({ root, artifacts: [artifact('/../../outside.md')] }),
      /escaped the build directory/u
    )
  })
})
