import assert from 'node:assert/strict'

import { describe, it } from 'vite-plus/test'

import {
  assertReleaseFiles,
  assertReleasePullRequest,
  assertSourceRun,
  type PullRequest
} from './github.ts'
import { planRelease } from './versioning.ts'

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
    assert.equal(assertSourceRun(run, repository), SHA)
    for (const patch of [
      { conclusion: 'failure' },
      { event: 'pull_request' },
      { head_branch: 'feature' },
      { path: '.github/workflows/other.yml' },
      { head_repository: { full_name: 'fork/repo' } }
    ]) {
      assert.throws(
        () => assertSourceRun({ ...run, ...patch }, repository),
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
    assertReleasePullRequest(pr, repository, 'release/v1.0.0', SHA)
    assert.throws(
      () =>
        assertReleasePullRequest(
          { ...pr, user: { login: 'someone' } },
          repository,
          'release/v1.0.0',
          SHA
        ),
      /identity/u
    )
    assert.throws(
      () =>
        assertReleasePullRequest(
          pr,
          repository,
          'release/v1.0.0',
          'b'.repeat(SHA_LENGTH)
        ),
      /identity/u
    )
  })
})
