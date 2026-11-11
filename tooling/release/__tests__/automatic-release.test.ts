import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { describe, it } from 'node:test'

import { fixture } from './fixtures.ts'

describe(
  'release orchestration with isolated Git and GitHub',
  { timeout: 30_000, concurrency: true },
  () => {
    it('rejects invalid main protection before creating any release artifact', async context => {
      for (const protection of ['isUnprotected', 'isLoose'] as const) {
        const f = await fixture(context)
        await f.patch({ [protection]: true })
        await assert.rejects(
          f.run('prepare'),
          /Main requires strict CI protection/u
        )
        const state = await f.state()
        assert.deepEqual(
          state.calls.filter(call => !call.startsWith('GET ')),
          []
        )
      }
    })

    it('recovers a merged release after tag creation fails even if protection changed', async context => {
      const f = await fixture(context)
      await f.run('prepare')
      await f.patch({ hasTagRefFailure: true })
      await assert.rejects(f.run('publish'), /GitHub API POST/u)
      const mergedState = await f.state()
      assert.equal(mergedState.isMerged, true)
      await f.patch({ hasTagRefFailure: false, isUnprotected: true })
      await f.run('prepare')
      await f.run('publish')
      const state = await f.state()
      assert.equal(state.release?.tag_name, 'v1.0.0')
      assert.equal(
        state.calls.filter(
          call => call === 'PUT repos/owner/repo/pulls/1/merge'
        ).length,
        1
      )
    })

    it('refuses recovery when a manual merge used a different base', async context => {
      const f = await fixture(context)
      await f.run('prepare')
      await f.patch({ hasTagRefFailure: true })
      await assert.rejects(f.run('publish'), /GitHub API POST/u)
      const before = await f.state()
      await f.patch({ hasTagRefFailure: false, hasDifferentMergeBase: true })
      await f.run('prepare')
      await assert.rejects(
        f.run('publish'),
        /Merge differs from the validated release tree/u
      )
      const after = await f.state()
      assert.equal(after.release, undefined)
      assert.deepEqual(
        after.calls.filter(call => !call.startsWith('GET ')),
        before.calls.filter(call => !call.startsWith('GET '))
      )
    })

    it('recovers after a release API failure without recreating commit, PR, merge or tag', async context => {
      const f = await fixture(context)
      try {
        await f.run('prepare')
        await f.run('prepare')
        await f.patch({ shouldFailRelease: true })
        await assert.rejects(f.run('publish'), /GitHub API POST/u)
        await f.patch({ shouldFailRelease: false })
        await f.run('prepare')
        await f.run('publish')
        await f.run('publish')
        const state = await f.state()
        assert.equal(state.release?.tag_name, 'v1.0.0')
        assert.equal(state.isDeleted, true)
        for (const call of [
          'POST repos/owner/repo/git/commits',
          'POST repos/owner/repo/pulls',
          'PUT repos/owner/repo/pulls/1/merge',
          'POST repos/owner/repo/git/tags'
        ]) {
          assert.equal(state.calls.filter(value => value === call).length, 1)
        }
        await f.patch({ hasWrongTag: true })
        await assert.rejects(f.run('publish'), /another commit/u)
      } finally {
        // As fixtures contêm só dados sintéticos e ficam no diretório temporário do sistema.
        assert.ok(f.directory.startsWith(tmpdir()))
      }
    })

    it('preserves a release branch updated before or during cleanup', async context => {
      for (const patch of [
        { hasCleanupAdvanced: true },
        { hasCleanupRace: true }
      ]) {
        const f = await fixture(context)
        await f.run('prepare')
        await f.patch(patch)
        const result = await f.run('publish')
        assert.match(
          result.stderr,
          /Release published; branch cleanup could not complete/u
        )
        const state = await f.state()
        assert.equal(state.release?.tag_name, 'v1.0.0')
        assert.notEqual(state.isDeleted, true)
        await f.patch({ hasCleanupAdvanced: false, hasCleanupRace: false })
        await f.run('publish')
        const recovered = await f.state()
        assert.equal(recovered.isDeleted, true)
      }
    })

    it('does not mutate main if it advances at the protected merge boundary', async context => {
      const f = await fixture(context)
      try {
        await f.run('prepare')
        await f.patch({ hasRace: true })
        await assert.rejects(f.run('publish'), /GitHub API PUT/u)
        const state = await f.state()
        assert.equal(state.isChecked, true)
        assert.equal(state.isMerged, undefined)
        assert.equal(
          state.calls.includes('POST repos/owner/repo/git/tags'),
          false
        )
      } finally {
        // As fixtures contêm só dados sintéticos e ficam no diretório temporário do sistema.
        assert.ok(f.directory.startsWith(tmpdir()))
      }
    })

    it('refuses merge when main is unprotected or its CI requirement is loose', async context => {
      for (const protection of ['isUnprotected', 'isLoose'] as const) {
        const f = await fixture(context)
        await f.run('prepare')
        await f.patch({ [protection]: true })
        await assert.rejects(
          f.run('publish'),
          /Main requires strict CI protection/u
        )
        const state = await f.state()
        assert.equal(state.isMerged, undefined)
        assert.equal(state.isChecked, undefined)
      }
    })
  }
)
