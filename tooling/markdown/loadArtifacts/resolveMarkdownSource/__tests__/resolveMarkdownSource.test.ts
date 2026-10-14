/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it } from 'node:test'

import { resolveMarkdownSource } from '../index.ts'

it('rejects a circular route re-export before evaluating either module', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'markdown-cycle-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'index.tsx')
  await writeFile(file, `export { route } from './cycle.ts';`)
  await writeFile(
    path.join(directory, 'cycle.ts'),
    `export { route } from './index.tsx';`
  )
  await assert.rejects(
    resolveMarkdownSource({
      file,
      resolve: ({ source, importer }) =>
        Promise.resolve(path.resolve(path.dirname(importer), source))
    }),
    /Circular Markdown route re-export/u
  )
})
