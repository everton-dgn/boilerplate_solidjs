import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { HEAD, SHA_LENGTH } from './constants.ts'
import { fixture, mutations } from './fixtures.ts'
import type { OpenPull, StaleCommit } from './types.ts'

type OpenPullInput = {
  number: number
  head: string
  ref: string
  login: string
}

const STALE_PR = 2
const NEWER_PR = 3
const HUMAN_PR = 4
const OTHER_BRANCH_PR = 5
const PULLS_PAGE_SIZE = 100

function openPull({ number, head, ref, login }: OpenPullInput): OpenPull {
  return {
    number,
    state: 'open',
    user: { login },
    head: { sha: head, ref, repo: { full_name: 'owner/repo' } },
    base: { ref: 'main', repo: { full_name: 'owner/repo' } }
  }
}

function releaseCommit(sha: string, parent: string): StaleCommit {
  return { sha, tree: { sha: 'tree' }, parents: [{ sha: parent }] }
}

describe(
  'obsolete releases after main advances',
  { timeout: 30_000, concurrency: true },
  () => {
    it('stops on invalid CI and skips the merge without failing when main advances', async context => {
      const f = await fixture(context)
      await f.patch({ badRun: true })
      await assert.rejects(f.run('prepare'), /successful push CI/u)
      await f.patch({ badRun: false })
      await f.run('prepare')
      await f.patch({ advanced: true })
      const before = await f.state()

      await f.run('publish')

      const after = await f.state()
      assert.deepEqual(mutations(after), mutations(before))
      assert.equal(after.pr?.state, 'open')
      assert.match(await f.summary(), /merge skipped.*#1/u)
    })

    it('postpones without artifacts when main advances before preparing', async context => {
      const f = await fixture(context)
      await f.patch({ advanced: true })

      await f.run('prepare')

      const state = await f.state()
      assert.deepEqual(mutations(state), [])
      assert.equal(await f.lastOutput('publish'), 'false')
      assert.match(await f.summary(), /Main advanced past a{40}/u)
    })

    it('closes its own obsolete pull request when main advances after preparing', async context => {
      const f = await fixture(context)
      await f.run('prepare')
      assert.equal(await f.lastOutput('publish'), 'true')
      await f.patch({ advanced: true })

      await f.run('prepare')

      const state = await f.state()
      assert.deepEqual(state.closed, [1])
      assert.equal(state.pr?.state, 'closed')
      assert.equal(
        state.calls.includes('PUT repos/owner/repo/pulls/1/merge'),
        false
      )
      assert.equal(await f.lastOutput('publish'), 'false')
    })

    it('closes only open release pull requests from older sources', async context => {
      const f = await fixture(context)
      const older = '1'.repeat(SHA_LENGTH)
      const newer = '3'.repeat(SHA_LENGTH)
      const staleHead = '2'.repeat(SHA_LENGTH)
      const newerHead = '4'.repeat(SHA_LENGTH)
      await f.patch({
        openPulls: [
          openPull({
            number: STALE_PR,
            head: staleHead,
            ref: 'release/v0.9.0-111111111111',
            login: 'github-actions[bot]'
          }),
          openPull({
            number: NEWER_PR,
            head: newerHead,
            ref: 'release/v1.1.0-333333333333',
            login: 'github-actions[bot]'
          }),
          openPull({
            number: HUMAN_PR,
            head: staleHead,
            ref: 'release/v0.9.0-111111111111',
            login: 'someone'
          }),
          openPull({
            number: OTHER_BRANCH_PR,
            head: staleHead,
            ref: 'feat/release-notes',
            login: 'github-actions[bot]'
          })
        ],
        commits: {
          [staleHead]: releaseCommit(staleHead, older),
          [newerHead]: releaseCommit(newerHead, newer)
        },
        notAncestors: [newer]
      })

      await f.run('prepare')

      const state = await f.state()
      assert.deepEqual(state.closed, [STALE_PR])
      assert.equal(await f.lastOutput('publish'), 'true')
    })

    it('warns when the open pull requests fill the first page', async context => {
      const f = await fixture(context)
      await f.patch({
        openPulls: Array.from({ length: PULLS_PAGE_SIZE }, () =>
          openPull({
            number: HUMAN_PR,
            head: HEAD,
            ref: 'feat/other',
            login: 'someone'
          })
        )
      })

      await f.run('prepare')

      assert.match(
        await f.summary(),
        /Checked only the latest 100 open pull requests to main/u
      )
      assert.equal(await f.lastOutput('publish'), 'true')
    })
  }
)
