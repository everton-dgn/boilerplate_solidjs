/* oxlint-disable vitest/no-import-node-test -- O Bun executa os testes de release pela API node:test. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { shouldTestRelease } from '../index.ts'

const SHA_LENGTH = 40
const base = 'a'.repeat(SHA_LENGTH)
const head = 'b'.repeat(SHA_LENGTH)
const input = { eventName: 'push', base, head }

describe('release test selection', () => {
  it('skips unrelated application and documentation changes', async () => {
    for (const files of [
      [],
      ['src/App.tsx', 'src/components/Button/index.tsx'],
      ['README.md', 'docs/development.md'],
      ['tooling/css/check.ts', 'src/i18n/en.json'],
      ['src/tooling/release/example.ts', 'package.json.backup'],
      ['src/line\nbreak.tsx']
    ]) {
      assert.equal(
        await shouldTestRelease({
          ...input,
          runGit: () => Promise.resolve(files.join('\0'))
        }),
        false
      )
    }
  })

  it('runs when release sources, tests, dependencies or configuration change', async () => {
    for (const file of [
      'tooling/release/automatic-release.ts',
      'tooling/release/check-changes.ts',
      'tooling/release/shouldTestRelease/index.ts',
      'tooling/release/__tests__/versioning.test.ts',
      'tooling/fmt.ts',
      '.commitlintrc',
      'package.json',
      'bun.lock',
      'bunfig.toml',
      'vite.config.ts',
      'tsconfig.json',
      'tsconfig.node.json',
      '.github/workflows/ci.yml',
      '.github/workflows/auto-release.yml',
      '.github/actions/setup-project/action.yml'
    ]) {
      assert.equal(
        await shouldTestRelease({
          ...input,
          runGit: () => Promise.resolve(`src/App.tsx\0${file}\0`)
        }),
        true,
        file
      )
    }
  })

  it('compares pushes from before to the tested commit, including deleted paths', async () => {
    const calls: string[][] = []
    const shouldRun = await shouldTestRelease({
      ...input,
      runGit: args => {
        calls.push(args)
        return Promise.resolve('tooling/release/removed.ts\0src/moved.ts\0')
      }
    })
    assert.equal(shouldRun, true)
    assert.deepEqual(calls, [
      ['diff', '--no-renames', '--name-only', '-z', base, head, '--']
    ])
  })

  it('compares pull requests from the merge base instead of the base tip', async () => {
    const common = 'c'.repeat(SHA_LENGTH)
    const calls: string[][] = []
    const shouldRun = await shouldTestRelease({
      ...input,
      eventName: 'pull_request',
      runGit: args => {
        calls.push(args)
        return Promise.resolve(
          args[0] === 'merge-base' ? `${common}\n` : 'src/App.tsx\0'
        )
      }
    })
    assert.equal(shouldRun, false)
    assert.deepEqual(calls, [
      ['merge-base', base, head],
      ['diff', '--no-renames', '--name-only', '-z', common, head, '--']
    ])
  })

  it('runs without a usable event or commit range', async () => {
    for (const patch of [
      { base: undefined },
      { base: '0'.repeat(SHA_LENGTH) },
      { base: '--invalid' },
      { head: undefined },
      { head: 'invalid' },
      { eventName: undefined },
      { eventName: 'workflow_dispatch' }
    ]) {
      let hasCalledGit = false
      assert.equal(
        await shouldTestRelease({
          ...input,
          ...patch,
          runGit: () => {
            hasCalledGit = true
            return Promise.resolve('')
          }
        }),
        true
      )
      assert.equal(hasCalledGit, false)
    }
  })

  it('runs when Git cannot resolve the base or compare commits', async () => {
    for (const eventName of ['push', 'pull_request']) {
      assert.equal(
        await shouldTestRelease({
          ...input,
          eventName,
          runGit: () => Promise.reject(new Error('Unavailable history.'))
        }),
        true
      )
    }
  })
})
