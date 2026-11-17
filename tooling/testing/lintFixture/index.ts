/* oxlint-disable node/no-sync -- The fixture is assembled in sequence and the test waits for the real CLI. */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { TestContext } from 'node:test'

type LintFixture = {
  context: TestContext
  sources: Record<string, string>
  config?: string
}

const ROOT = path.resolve(import.meta.dirname, '../../..')
// The local lint plugins are resolved through ./tooling, linked into the fixture.
const PROJECT_LINT_CONFIG =
  'import { lint } from "./tooling/lint.ts"; export default { lint: { ...lint, options: { typeAware: false, typeCheck: false } } }'

export function lintFixture({
  context,
  sources,
  config
}: LintFixture): SpawnSyncReturns<string> {
  const directory = mkdtempSync(path.join(tmpdir(), 'solid-lint-fixture-'))
  // Sandbox created by the test itself: direct removal is the right disposal.
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const links =
    config === undefined ? ['node_modules', 'tooling'] : ['node_modules']
  for (const name of links) {
    symlinkSync(path.join(ROOT, name), path.join(directory, name), 'dir')
  }
  writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ type: 'module' }),
    { flag: 'wx' }
  )
  writeFileSync(
    path.join(directory, 'vite.config.ts'),
    config ?? PROJECT_LINT_CONFIG,
    { flag: 'wx' }
  )
  for (const [filename, source] of Object.entries(sources)) {
    // With the project lint, tooling points to the real repository.
    if (config === undefined && filename.startsWith('tooling/')) {
      throw new Error(`${filename} needs its own config in the fixture.`)
    }
    const destination = path.join(directory, filename)
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, source, { flag: 'wx' })
  }
  return spawnSync(
    path.join(ROOT, 'node_modules/.bin/vp'),
    ['lint', ...Object.keys(sources), '--format', 'json'],
    { cwd: directory, encoding: 'utf8', timeout: 30_000 }
  )
}
