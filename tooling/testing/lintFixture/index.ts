/* oxlint-disable node/no-sync -- A fixture é montada em sequência e o teste aguarda o CLI real. */
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
// oxlint-disable-next-line vitest/no-import-node-test -- Os testes de tooling usam o runner nativo do Node.js.
import type { TestContext } from 'node:test'

type LintFixture = {
  context: TestContext
  sources: Record<string, string>
  config?: string
}

const ROOT = path.resolve(import.meta.dirname, '../../..')
// Os plugins locais do lint são resolvidos por ./tooling, ligado à fixture.
const PROJECT_LINT_CONFIG =
  'import { lint } from "./tooling/lint.ts"; export default { lint: { ...lint, options: { typeAware: false, typeCheck: false } } }'

export function lintFixture({
  context,
  sources,
  config
}: LintFixture): SpawnSyncReturns<string> {
  const directory = mkdtempSync(path.join(tmpdir(), 'solid-lint-fixture-'))
  // Sandbox criado pelo próprio teste: a remoção direta é o descarte correto.
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
    // Com o lint do projeto, tooling aponta para o repositório real.
    if (config === undefined && filename.startsWith('tooling/')) {
      throw new Error(`${filename} exige uma config própria na fixture.`)
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
