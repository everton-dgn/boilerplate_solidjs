import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { HEAD, SHA_LENGTH } from './constants.ts'
import { fixture, mutations } from './fixtures.ts'
import type { Artifact } from './types.ts'

// O Bun imprime trechos do código ao redor do throw no stderr; só a linha da
// mensagem do erro prova qual verificação recusou o artifact.
function thrown(message: string): RegExp {
  const escaped = message.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)
  return new RegExp(`^(?:error|[A-Z]\\w*Error): [^\\n]*${escaped}`, 'mu')
}

describe(
  'release metadata validation with isolated Git and GitHub',
  { timeout: 30_000, concurrency: true },
  () => {
    it('attests release metadata against the successful source CI before merging', async context => {
      const f = await fixture(context)
      await f.run('prepare')
      await f.run('publish')
      const state = await f.state()

      assert.equal(state.check?.head_sha, HEAD)
      assert.equal(
        state.check.details_url,
        'https://github.com/owner/repo/actions/runs/1'
      )
      assert.equal(
        state.check.output.title,
        'Release metadata validated against successful source CI'
      )
      assert.match(
        state.check.output.summary,
        /Source CI passed for a{40}.*changes only the package version and generated changelog/u
      )
      assert.ok(
        state.check.output.summary.includes(
          '[View source CI](https://github.com/owner/repo/actions/runs/1)'
        )
      )
      assert.ok(
        state.calls.indexOf('POST repos/owner/repo/check-runs') <
          state.calls.indexOf('PUT repos/owner/repo/pulls/1/merge')
      )
      assert.equal(state.release?.tag_name, 'v1.0.0')
      assert.equal(await f.lastOutput('tag'), 'v1.0.0')
      assert.equal(await f.lastOutput('version'), '1.0.0')
    })

    it('rejects a release whose source CI no longer passes', async context => {
      const f = await fixture(context)
      await f.run('prepare')
      await f.patch({ badRun: true })
      const before = await f.state()

      await assert.rejects(f.run('publish'), /successful push CI/u)

      const after = await f.state()
      assert.deepEqual(
        after.calls.filter(call => !call.startsWith('GET ')),
        before.calls.filter(call => !call.startsWith('GET '))
      )
    })

    it('rejects release changes outside the validated metadata', async context => {
      const f = await fixture(context)
      await f.run('prepare')
      const scenarios = [
        { patch: { hasUnexpectedParent: true }, error: /direct child/u },
        {
          patch: {
            changedFiles: ['CHANGELOG.md', 'package.json', 'src/App.tsx']
          },
          error: /must change only/u
        },
        {
          patch: { hasFileModeChange: true },
          error: /preserve file modes and types/u
        }
      ]
      for (const { patch, error } of scenarios) {
        await f.patch({
          hasUnexpectedParent: false,
          hasFileModeChange: false,
          changedFiles: ['CHANGELOG.md', 'package.json'],
          ...patch
        })
        const before = await f.state()

        await assert.rejects(f.run('publish'), error)

        const after = await f.state()
        assert.deepEqual(
          after.calls.filter(call => !call.startsWith('GET ')),
          before.calls.filter(call => !call.startsWith('GET '))
        )
      }
    })

    it('rejects modified dependencies, versions and changelog content before attesting', async context => {
      const f = await fixture(context)
      await f.run('prepare')
      const { files } = await f.state()
      assert.ok(files)
      const changes = [
        {
          path: 'package.json',
          from: '"name": "fixture"',
          to: '"name": "fixture", "dependencies": { "unexpected": "1.0.0" }'
        },
        {
          path: 'package.json',
          from: '"version": "1.0.0"',
          to: '"version": "9.0.0"'
        },
        {
          path: 'CHANGELOG.md',
          from: 'initial application',
          to: 'unexpected change'
        }
      ]
      for (const { path: file, from, to } of changes) {
        const before = await f.state()
        const original = files[file]
        assert.ok(original)
        assert.ok(original.includes(from))
        await f.patch({
          files: { ...files, [file]: original.replace(from, to) }
        })

        await assert.rejects(f.run('publish'), /Unexpected release content/u)

        const after = await f.state()
        assert.deepEqual(
          after.calls.filter(call => !call.startsWith('GET ')),
          before.calls.filter(call => !call.startsWith('GET '))
        )
      }
    })
  }
)

describe(
  'release plan artifact from the read-only job',
  { timeout: 30_000, concurrency: true },
  () => {
    it('rejects a tampered artifact before any mutation', async context => {
      const cases: [(artifact: Artifact) => Artifact, string][] = [
        [artifact => ({ ...artifact, extra: true }), 'unexpected structure'],
        [artifact => ({ ...artifact, changelog: 1 }), 'unexpected structure'],
        [
          artifact => ({ ...artifact, source: 'e'.repeat(SHA_LENGTH) }),
          'does not match the source plan'
        ],
        [
          artifact => ({
            ...artifact,
            packageJson: String(artifact.packageJson).replace(
              '"name": "fixture"',
              '"name": "fixture", "scripts": { "postinstall": "curl" }'
            )
          }),
          'changes package.json'
        ],
        [
          artifact => ({
            ...artifact,
            changelog: String(artifact.changelog).replace(
              'initial application',
              'initial [link](https://example.com)'
            )
          }),
          'changes CHANGELOG.md'
        ]
      ]
      for (const [tamper, error] of cases) {
        const f = await fixture(context)
        await f.replaceArtifact(tamper(await f.artifact()))

        await assert.rejects(f.run('prepare'), thrown(error))

        assert.deepEqual(mutations(await f.state()), [])
      }
    })

    it('accepts formatting differences limited to whitespace', async context => {
      const f = await fixture(context)
      const artifact = await f.artifact()
      await f.replaceArtifact({
        ...artifact,
        changelog: String(artifact.changelog).replace(
          '# Changelog\n',
          '# Changelog   \n\n'
        )
      })

      await f.run('prepare')

      const state = await f.state()
      assert.equal(
        state.files?.['CHANGELOG.md']?.startsWith('# Changelog   \n'),
        true
      )
    })
  }
)
