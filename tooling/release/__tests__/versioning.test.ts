/* oxlint-disable vitest/no-import-node-test -- O Bun executa os testes de release pela API node:test. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { describe, it } from 'node:test'
import { promisify } from 'node:util'

import {
  assertReleaseFiles,
  assertReleasePullRequest,
  assertSourceRun,
  isOpenReleasePullRequest
} from '../github.ts'
import type { PullRequest } from '../types.ts'
import { planRelease } from '../versioning.ts'

const SHA_LENGTH = 40
const SHA = 'a'.repeat(SHA_LENGTH)
const base = {
  currentVersion: '1.2.3',
  baselineTag: 'v1.2.3',
  changelog: '# Changelog\n\n## Unreleased\n',
  date: '2026-09-12'
}
const commits = (...messages: string[]) =>
  messages.map(message => ({ sha: SHA, message }))
const execute = promisify(execFile)
const ROOT = path.resolve(import.meta.dirname, '../../..')
const COMMITLINT = path.join(ROOT, 'node_modules/.bin/commitlint')

// O commitlint lê a mensagem do stdin e usa a configuração do projeto.
async function isValidCommitMessage(message: string): Promise<boolean> {
  const pending = execute(COMMITLINT, { cwd: ROOT })
  pending.child.stdin?.end(message)
  try {
    await pending
    return true
  } catch (error) {
    // Só uma saída diferente de zero reprova a mensagem; sem o binário, o
    // erro precisa falhar o teste.
    if (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'number'
    ) {
      return false
    }
    throw error
  }
}

describe('release versioning', () => {
  it('starts at 1.0.0 and keeps Unreleased for the next release', () => {
    const plan = planRelease({
      ...base,
      baselineTag: undefined,
      currentVersion: '0.0.0',
      commits: commits('fix: repair counter')
    })
    assert.equal(plan?.version, '1.0.0')
    assert.match(plan.changelog, /## Unreleased\n\n## 1\.0\.0 - 2026-09-12/u)
  })

  it('uses the strongest bump and includes dependency changes', () => {
    assert.equal(
      planRelease({ ...base, commits: commits('chore(deps): update vite') })
        ?.version,
      '1.2.4'
    )
    assert.equal(
      planRelease({
        ...base,
        commits: commits('fix: repair', 'feat: add route')
      })?.version,
      '1.3.0'
    )
    assert.equal(
      planRelease({
        ...base,
        commits: commits('feat: add route', 'fix(api)!: change response')
      })?.version,
      '2.0.0'
    )
  })

  it('recognizes breaking changes in any body line outside fences', () => {
    for (const message of [
      'fix: change\nBREAKING CHANGE: new API',
      'fix: change\n\nExplain the change.\nBREAKING CHANGE: new API',
      'fix: change\n\nExplain the change.\nBREAKING-CHANGE: new API'
    ]) {
      assert.equal(
        planRelease({ ...base, commits: commits(message) })?.version,
        '2.0.0',
        message
      )
    }
    for (const message of [
      'fix: change\n\nMentions BREAKING CHANGE: inline',
      'fix: change\n\nBREAKING CHANGE:',
      'BREAKING CHANGE: not a conventional subject'
    ]) {
      assert.notEqual(
        planRelease({ ...base, commits: commits(message) })?.version,
        '2.0.0',
        message
      )
    }
  })

  it('requires a blank line before footers in commit messages', async () => {
    assert.equal(
      await isValidCommitMessage('fix: change\n\nBREAKING CHANGE: new API'),
      true
    )
    for (const message of [
      'fix: change\nBREAKING CHANGE: new API',
      'fix: change\n\nExplain the change.\nBREAKING CHANGE: new API'
    ]) {
      assert.equal(await isValidCommitMessage(message), false, message)
    }
  })

  it('recognizes breaking footers but ignores fenced examples', () => {
    assert.equal(
      planRelease({
        ...base,
        commits: commits('fix: change\n\nBREAKING CHANGE: new API')
      })?.version,
      '2.0.0'
    )
    assert.equal(
      planRelease({
        ...base,
        commits: commits('fix: docs\n\n```text\nBREAKING CHANGE: example\n```')
      })?.version,
      '1.2.4'
    )
  })

  // oxlint-disable-next-line vitest/prefer-each -- O node:test não tem a API it.each.
  for (const [open, inner, close] of [
    ['````', '```', '````'],
    ['~~~~', '~~~', '~~~~'],
    ['```', '~~~', '```'],
    ['```', '```text', '````']
  ]) {
    it(`preserves examples inside ${open} fences containing ${inner}`, () => {
      const message = [
        'fix: docs',
        '',
        open,
        inner,
        '',
        'BREAKING CHANGE: example',
        close
      ].join('\n')
      assert.equal(
        planRelease({ ...base, commits: commits(message) })?.version,
        '1.2.4'
      )
      assert.equal(
        planRelease({
          ...base,
          commits: commits(`${message}\n\nBREAKING CHANGE: actual change`)
        })?.version,
        '2.0.0'
      )
    })
  }

  it('skips documentation and release commits without a loop', () => {
    assert.equal(
      planRelease({
        ...base,
        commits: commits('docs: update guide', 'chore(release): v1.2.3')
      }),
      undefined
    )
  })

  it('rejects version drift and invalid initial versions', () => {
    assert.throws(
      () =>
        planRelease({
          ...base,
          baselineTag: 'v1.2.2',
          commits: commits('fix: repair')
        }),
      /differs/u
    )
    assert.throws(
      () =>
        planRelease({
          ...base,
          baselineTag: undefined,
          commits: commits('fix: repair')
        }),
      /0\.0\.0/u
    )
  })

  it('preserves curated notes and previous releases deterministically', () => {
    const input = {
      ...base,
      changelog:
        '# Changelog\n\n## Unreleased\n\nCurated notes.\n\n## 1.2.3 - 2026-08-01\n\nPrevious notes.\n',
      commits: commits('fix: repair')
    }
    const plan = planRelease(input)
    assert.equal(plan?.notes, 'Curated notes.')
    assert.match(plan.changelog, /Previous notes/u)
    assert.deepEqual(planRelease(input), plan)
  })

  it('escapes mentions and HTML in generated notes', () => {
    const plan = planRelease({
      ...base,
      commits: commits('fix: <script> @everyone #123')
    })
    assert.match(plan?.notes ?? '', /&lt;script&gt; &#64;everyone/u)
  })
})

describe('release identity gates', () => {
  const repository = 'owner/repo'
  const run = {
    conclusion: 'success',
    event: 'push',
    head_branch: 'main',
    head_sha: SHA,
    path: '.github/workflows/ci.yml',
    head_repository: { full_name: repository }
  }

  it('accepts only successful push CI from this repository and workflow', () => {
    assert.equal(assertSourceRun({ run, repository }), SHA)
    for (const patch of [
      { conclusion: 'failure' },
      { event: 'pull_request' },
      { head_branch: 'feature' },
      { path: '.github/workflows/other.yml' },
      { head_repository: { full_name: 'fork/repo' } }
    ]) {
      assert.throws(
        () => assertSourceRun({ run: { ...run, ...patch }, repository }),
        /successful push CI/u
      )
    }
  })

  it('rejects unrelated files and human-owned release branches', () => {
    assertReleaseFiles(['package.json', 'CHANGELOG.md'])
    assert.throws(
      () => assertReleaseFiles(['package.json', 'CHANGELOG.md', 'src/api.ts']),
      /only/u
    )
    const pr: PullRequest = {
      number: 1,
      state: 'open',
      merged: false,
      merge_commit_sha: null,
      user: { login: 'github-actions[bot]' },
      head: {
        sha: SHA,
        ref: 'release/v1.0.0',
        repo: { full_name: repository }
      },
      base: { ref: 'main', repo: { full_name: repository } }
    }
    assertReleasePullRequest({
      pr,
      repository,
      branch: 'release/v1.0.0',
      head: SHA
    })
    assert.throws(
      () =>
        assertReleasePullRequest({
          pr: { ...pr, user: { login: 'someone' } },
          repository,
          branch: 'release/v1.0.0',
          head: SHA
        }),
      /identity/u
    )
    assert.throws(
      () =>
        assertReleasePullRequest({
          pr,
          repository,
          branch: 'release/v1.0.0',
          head: 'b'.repeat(SHA_LENGTH)
        }),
      /identity/u
    )
  })
})

describe('obsolete release pull requests', () => {
  const repository = 'owner/repo'
  const pr: PullRequest = {
    number: 2,
    state: 'open',
    merged: false,
    merge_commit_sha: null,
    user: { login: 'github-actions[bot]' },
    head: {
      sha: SHA,
      ref: 'release/v1.2.4-aaaaaaaaaaaa',
      repo: { full_name: repository }
    },
    base: { ref: 'main', repo: { full_name: repository } }
  }

  it('selects only open bot pull requests from release branches', () => {
    assert.equal(isOpenReleasePullRequest({ pr, repository }), true)
    for (const patch of [
      { state: 'closed' },
      { merged: true },
      { user: { login: 'someone' } },
      { head: { ...pr.head, ref: 'release/v1.2.4' } },
      { head: { ...pr.head, ref: 'feat/release-v1.2.4-aaaaaaaaaaaa' } },
      { head: { ...pr.head, repo: { full_name: 'fork/repo' } } },
      { base: { ...pr.base, ref: 'develop' } }
    ]) {
      assert.equal(
        isOpenReleasePullRequest({ pr: { ...pr, ...patch }, repository }),
        false,
        JSON.stringify(patch)
      )
    }
  })
})
