/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
/* oxlint-disable node/no-sync -- A integração cria uma fixture isolada e aguarda o CLI real. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import * as v from 'valibot'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const DIAGNOSTIC = v.object({ filename: v.string(), code: v.string() })
const DIAGNOSTICS = v.object({ diagnostics: v.array(DIAGNOSTIC) })

test('o lint reconhece o alias do Paraglide e exige referências estáticas às mensagens', context => {
  const directory = mkdtempSync(path.join(tmpdir(), 'solid-message-access-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  for (const name of ['node_modules', 'tooling']) {
    symlinkSync(path.join(ROOT, name), path.join(directory, name), 'dir')
  }
  writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ type: 'module' }),
    { flag: 'wx' }
  )
  writeFileSync(
    path.join(directory, 'vite.config.ts'),
    'import { lint } from "./tooling/lint.ts"; export default { lint: { ...lint, options: { typeAware: false, typeCheck: false } } }',
    { flag: 'wx' }
  )
  mkdirSync(path.join(directory, 'src'))
  const fixtures = {
    dynamic:
      'import { m } from "@paraglide/messages.js"; export const read = key => m[key]()',
    alias:
      'import { m as messages } from "@paraglide/messages.js"; export const read = key => messages[key]()',
    spread:
      'import { m } from "@paraglide/messages.js"; export const copy = { ...m }',
    namespace:
      'import * as messages from "@paraglide/messages/_index.js"; export const read = key => messages[key]()',
    'namespace-static':
      'import * as messages from "@paraglide/messages/_index.js"; export const read = () => messages.home_title()',
    static:
      'import { m } from "@paraglide/messages.js"; export const read = () => m.home_title()',
    map: 'import { m } from "@paraglide/messages.js"; const messages = { title: m.home_title }; export const read = key => messages[key]()',
    shadow:
      'import { m } from "@paraglide/messages.js"; export const title = () => m.home_title(); export const read = (m, key) => m[key]()'
  }
  for (const [name, content] of Object.entries(fixtures)) {
    writeFileSync(path.join(directory, `src/${name}.ts`), content, {
      flag: 'wx'
    })
  }
  const result = spawnSync(
    path.join(ROOT, 'node_modules/.bin/vp'),
    ['lint', 'src', '--format', 'json'],
    { cwd: directory, encoding: 'utf8', timeout: 30_000 }
  )
  assert.equal(result.status, 1, result.stderr)
  const { diagnostics } = v.parse(DIAGNOSTICS, JSON.parse(result.stdout))
  const violations = diagnostics.filter(
    item => item.code === 'paraglide(no-dynamic-message-access)'
  )
  assert.deepEqual(
    violations.map(item => path.basename(item.filename)).toSorted(),
    ['alias.ts', 'dynamic.ts', 'namespace.ts', 'spread.ts']
  )
})
