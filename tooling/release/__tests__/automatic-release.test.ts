/* oxlint-disable vitest/no-import-node-test -- O Bun executa os testes de release pela API node:test. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execPath } from 'node:process'
import { describe, it, type TestContext } from 'node:test'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const EXECUTABLE_MODE = 0o700
const SHA_LENGTH = 40
const HEAD = 'b'.repeat(SHA_LENGTH)
const script = path.resolve('tooling/release/automatic-release.ts')
const planScript = path.resolve('tooling/release/plan-release.ts')
const STALE_PR = 2
const NEWER_PR = 3
const HUMAN_PR = 4
const OTHER_BRANCH_PR = 5

// O PATH do subprocesso contém só estes comandos falsos. Nenhum Git ou GitHub real fica acessível.
const fake = String.raw`
const fs = require('node:fs');
const args = process.argv.slice(2);
const path = process.env.FAKE_STATE;
const s = JSON.parse(fs.readFileSync(path, 'utf8'));
const source = 'a'.repeat(40), head = 'b'.repeat(40), merge = 'c'.repeat(40), tag = 'd'.repeat(40);
const root = 'repos/owner/repo';
const save = () => fs.writeFileSync(path, JSON.stringify(s));
const out = value => { save(); console.log(typeof value === 'string' ? value : JSON.stringify(value)); };
const fail = () => { save(); console.log('HTTP/2.0 404 Not Found\n\n{}'); process.exitCode = 1; };
if (process.argv[1].endsWith('/git')) {
  if (args.includes('push')) {
    const ref = 'refs/heads/' + s.branch;
    if (!s.release || !args.includes('--force-with-lease=' + ref + ':' + head) || !args.includes(':' + ref)) throw Error('Unsafe cleanup');
    if (s.cleanupRace) { save(); process.exitCode = 1; return; }
    s.ref = null; s.deleted = true; out(''); return;
  }
  const [command, ...rest] = args;
  if (command === 'merge-base' && rest[0] === '--is-ancestor' && (s.notAncestors ?? []).includes(rest[1])) { save(); process.exitCode = 1; return; }
  if (['fetch', 'merge-base'].includes(command)) out('');
  else if (command === 'rev-parse') out(source);
  else if (command === 'tag') out('');
  else if (command === 'log') out(source + '\0feat: initial application\0');
  else if (command === 'diff') out(args.includes('--summary') ? s.hasFileModeChange ? 'mode change 100644 => 120000 package.json' : '' : (s.changedFiles ?? ['CHANGELOG.md', 'package.json']).join('\n'));
  else if (command === 'show' && rest.includes('--format=%cI')) out('2026-09-12T00:00:00Z');
  else if (command === 'show' && rest[0] === source + ':package.json') out('{"name":"fixture","version":"0.0.0"}\n');
  else if (command === 'show' && rest[0] === source + ':CHANGELOG.md') out('# Changelog\n\n## Unreleased\n');
  else if (command === 'show' && rest[0].startsWith(head + ':')) out(s.files[rest[0].slice(41)]);
  else throw Error('Unexpected fake git call: ' + args.join(' '));
} else {
  const endpoint = args[1];
  const method = args.includes('--method') ? args[args.indexOf('--method') + 1] : 'GET';
  const body = args.includes('--input') ? JSON.parse(fs.readFileSync(0, 'utf8')) : {};
  s.calls.push(method + ' ' + endpoint);
  let value;
  if (method === 'PATCH' && /\/pulls\/\d+$/.test(endpoint)) {
    const number = Number(endpoint.split('/').pop());
    if (body.state !== 'closed') throw Error('Unexpected pull request update');
    s.closed = [...(s.closed ?? []), number];
    if (s.pr?.number === number) s.pr.state = 'closed';
    value = { number, state: 'closed' };
  }
  else if (endpoint === root + '/actions/runs/1') value = { conclusion: s.badRun ? 'failure' : 'success', event: 'push', head_branch: 'main', head_sha: source, path: '.github/workflows/ci.yml', head_repository: { full_name: 'owner/repo' } };
  else if (endpoint === root + '/git/ref/heads/main') value = { object: { sha: s.advanced ? 'e'.repeat(40) : s.merged ? merge : source } };
  else if (endpoint === root + '/rules/branches/main?per_page=100') value = s.unprotected ? [] : [{type:'pull_request'}, {type:'required_status_checks', parameters:{strict_required_status_checks_policy: !s.loose, required_status_checks:[{context:'CI required',integration_id:15368}]}}];
  else if (endpoint === root + '/check-runs') {
    if (body.name !== 'CI required' || body.head_sha !== head || body.conclusion !== 'success') throw Error('Wrong validated commit');
    s.check = body; s.checked = true; value = {id:1};
  }
  else if (endpoint.startsWith(root + '/git/ref/heads/release/')) value = s.ref === null ? undefined : s.release && s.cleanupAdvanced ? {object:{sha:source}} : s.ref;
  else if (endpoint === root + '/git/commits/' + source) value = { sha: source, tree: { sha: 'base-tree' }, parents: [] };
  else if (endpoint === root + '/git/commits/' + head) value = { sha: head, tree: { sha: 'release-tree' }, parents: [{sha: s.hasUnexpectedParent ? 'e'.repeat(40) : source}] };
  else if (endpoint === root + '/git/commits/' + merge) value = { sha: merge, tree: { sha: s.race ? 'wrong-tree' : 'release-tree' }, parents: [{sha: s.hasDifferentMergeBase ? 'e'.repeat(40) : source}, {sha: head}] };
  else if (endpoint.startsWith(root + '/git/commits/') && s.commits?.[endpoint.slice(root.length + 13)]) value = s.commits[endpoint.slice(root.length + 13)];
  else if (endpoint === root + '/git/trees') { s.files = Object.fromEntries(body.tree.map(f => [f.path, f.content])); value = {sha: 'release-tree'}; }
  else if (endpoint === root + '/git/commits') value = {sha: head};
  else if (endpoint === root + '/git/refs') {
    if (body.ref.startsWith('refs/heads/')) { s.branch = body.ref.slice(11); value = s.ref = {object: {sha: head, type: 'commit'}}; }
    else { if (s.hasTagRefFailure) { save(); process.exitCode = 1; return; } value = s.tagRef = {object: {sha: tag, type: 'tag'}}; }
  }
  else if (endpoint === root + '/pulls?state=open&base=main&per_page=100') value = s.openPulls ?? [];
  else if (endpoint.startsWith(root + '/pulls?')) value = s.pr ? [{number:s.pr.number}] : [];
  else if (endpoint === root + '/pulls') value = s.pr = {number: 1, state: 'open', merged: false, merge_commit_sha: null, user: {login: 'github-actions[bot]'}, head: {sha: head, ref: s.branch, repo: {full_name: 'owner/repo'}}, base: {ref: 'main', repo: {full_name: 'owner/repo'}}};
  else if (endpoint === root + '/pulls/1') value = s.pr;
  else if (endpoint === root + '/pulls/1/merge') {
    if (body.merge_method !== 'merge' || body.sha !== head) throw Error('Unsafe merge');
    // O GitHub rejeita um PR desatualizado na fronteira da mutação quando há strict checks.
    if (s.race && s.checked) { save(); process.exitCode=1; return; }
    s.merged = true; Object.assign(s.pr, {state:'closed', merged:true, merge_commit_sha:merge}); value = {merged:true,sha:merge};
  }
  else if (endpoint === root + '/git/ref/tags/v1.0.0') value = s.tagRef;
  else if (endpoint === root + '/git/tags') { s.tag = {object: {sha: body.object, type: body.type}}; value = {sha:tag}; }
  else if (endpoint === root + '/git/tags/' + tag) value = s.wrongTag ? {object:{sha:source,type:'commit'}} : s.tag;
  else if (endpoint === root + '/releases/tags/v1.0.0') value = s.release;
  else if (endpoint === root + '/releases') {
    if (s.failRelease) { save(); process.exitCode=1; return; }
    value = s.release = body;
  }
  else throw Error('Unexpected fake gh call: ' + method + ' ' + endpoint);
  if (value === undefined) fail();
  else if (args.includes('--include')) out('HTTP/2.0 200 OK\n\n' + JSON.stringify(value));
  else out(value);
}
`

type ReleaseCheck = {
  head_sha: string
  details_url: string
  output: { title: string; summary: string }
}

type OpenPull = {
  number: number
  state: string
  user: { login: string }
  head: { sha: string; ref: string; repo: { full_name: string } }
  base: { ref: string; repo: { full_name: string } }
}
type StaleCommit = {
  sha: string
  tree: { sha: string }
  parents: { sha: string }[]
}
type Artifact = Record<string, unknown>
type OpenPullInput = {
  number: number
  head: string
  ref: string
  login: string
}

type State = {
  calls: string[]
  files?: Record<string, string>
  changedFiles?: string[]
  check?: ReleaseCheck
  hasFileModeChange?: boolean
  hasUnexpectedParent?: boolean
  hasTagRefFailure?: boolean
  hasDifferentMergeBase?: boolean
  failRelease?: boolean
  badRun?: boolean
  advanced?: boolean
  race?: boolean
  wrongTag?: boolean
  unprotected?: boolean
  loose?: boolean
  checked?: boolean
  merged?: boolean
  deleted?: boolean
  cleanupAdvanced?: boolean
  cleanupRace?: boolean
  release?: { tag_name: string }
  pr?: { state: string }
  closed?: number[]
  openPulls?: OpenPull[]
  commits?: Record<string, StaleCommit>
  notAncestors?: string[]
}

async function fixture(context: TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), 'solid-release-test-'))
  // Sandbox criado pelo próprio teste: a remoção direta é o descarte correto.
  context.after(() => rm(directory, { recursive: true, force: true }))
  const statePath = path.join(directory, 'state.json')
  const planPath = path.join(directory, 'release-plan.json')
  const outputPath = path.join(directory, 'output')
  const summaryPath = path.join(directory, 'summary')
  await writeFile(statePath, JSON.stringify({ calls: [] }), { flag: 'wx' })
  for (const name of ['git', 'gh']) {
    const executable = path.join(directory, name)
    await writeFile(
      executable,
      `#!${execPath}\n${fake.replaceAll(String.raw`\\`, '\\')}`,
      {
        flag: 'wx'
      }
    )
    await chmod(executable, EXECUTABLE_MODE)
  }
  const environment = {
    PATH: directory,
    FAKE_STATE: statePath,
    GITHUB_REPOSITORY: 'owner/repo',
    RELEASE_SOURCE_RUN_ID: '1',
    RELEASE_PLAN_FILE: planPath,
    GITHUB_OUTPUT: outputPath,
    GITHUB_STEP_SUMMARY: summaryPath,
    GH_TOKEN: 'synthetic'
  }
  let isPlanned = false
  // O job de leitura gera o plano uma vez; as execuções seguintes simulam os
  // jobs com escrita e as recuperações do mesmo run de origem.
  async function plan() {
    if (isPlanned) return
    await execute(execPath, [planScript], { env: environment })
    isPlanned = true
  }
  return {
    directory,
    plan,
    async state(): Promise<State> {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- O estado é escrito exclusivamente por esta CLI sintética.
      return JSON.parse(await readFile(statePath, 'utf8')) as State
    },
    async patch(patch: Partial<State>) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Estado de fixture sintética apenas.
      const state = JSON.parse(await readFile(statePath, 'utf8')) as State
      await writeFile(statePath, JSON.stringify({ ...state, ...patch }))
    },
    async artifact(): Promise<Artifact> {
      await plan()
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Artifact gerado pelo script de plano nesta fixture.
      return JSON.parse(await readFile(planPath, 'utf8')) as Artifact
    },
    async replaceArtifact(artifact: Artifact) {
      await writeFile(planPath, JSON.stringify(artifact))
    },
    async lastOutput(name: string): Promise<string | undefined> {
      const content = await readFile(outputPath, 'utf8')
      return content
        .trim()
        .split('\n')
        .findLast(line => line.startsWith(`${name}=`))
        ?.slice(name.length + 1)
    },
    summary(): Promise<string> {
      return readFile(summaryPath, 'utf8')
    },
    async run(mode: string) {
      await plan()
      return execute(execPath, ['--no-install', script], {
        env: { ...environment, RELEASE_MODE: mode, RELEASE_HEAD: HEAD }
      })
    }
  }
}

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

// O Bun imprime trechos do código ao redor do throw no stderr; só a linha da
// mensagem do erro prova qual verificação recusou o artifact.
function thrown(message: string): RegExp {
  const escaped = message.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)
  return new RegExp(`^(?:error|[A-Z]\\w*Error): [^\\n]*${escaped}`, 'mu')
}

function mutations(state: State): string[] {
  return state.calls.filter(call => !call.startsWith('GET '))
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
        [artifact => ({ ...artifact, notes: 1 }), 'unexpected structure'],
        [
          artifact => ({ ...artifact, source: 'e'.repeat(SHA_LENGTH) }),
          'does not match the source plan'
        ],
        [
          artifact => ({ ...artifact, version: '9.0.0', tag: 'v9.0.0' }),
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
        ],
        [
          artifact => ({ ...artifact, notes: 'Different notes.' }),
          'notes differ'
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

describe(
  'release orchestration with isolated Git and GitHub',
  { timeout: 30_000, concurrency: true },
  () => {
    it('rejects invalid main protection before creating any release artifact', async context => {
      for (const protection of ['unprotected', 'loose'] as const) {
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
      assert.equal(mergedState.merged, true)
      await f.patch({ hasTagRefFailure: false, unprotected: true })
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
        await f.patch({ failRelease: true })
        await assert.rejects(f.run('publish'), /GitHub API POST/u)
        await f.patch({ failRelease: false })
        await f.run('prepare')
        await f.run('publish')
        await f.run('publish')
        const state = await f.state()
        assert.equal(state.release?.tag_name, 'v1.0.0')
        assert.equal(state.deleted, true)
        for (const call of [
          'POST repos/owner/repo/git/commits',
          'POST repos/owner/repo/pulls',
          'PUT repos/owner/repo/pulls/1/merge',
          'POST repos/owner/repo/git/tags'
        ]) {
          assert.equal(state.calls.filter(value => value === call).length, 1)
        }
        await f.patch({ wrongTag: true })
        await assert.rejects(f.run('publish'), /another commit/u)
      } finally {
        // As fixtures contêm só dados sintéticos e ficam no diretório temporário do sistema.
        assert.ok(f.directory.startsWith(tmpdir()))
      }
    })

    it('preserves a release branch updated before or during cleanup', async context => {
      for (const patch of [{ cleanupAdvanced: true }, { cleanupRace: true }]) {
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
        assert.notEqual(state.deleted, true)
        await f.patch({ cleanupAdvanced: false, cleanupRace: false })
        await f.run('publish')
        const recovered = await f.state()
        assert.equal(recovered.deleted, true)
      }
    })

    it('does not mutate main if it advances at the protected merge boundary', async context => {
      const f = await fixture(context)
      try {
        await f.run('prepare')
        await f.patch({ race: true })
        await assert.rejects(f.run('publish'), /GitHub API PUT/u)
        const state = await f.state()
        assert.equal(state.checked, true)
        assert.equal(state.merged, undefined)
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
      for (const protection of ['unprotected', 'loose'] as const) {
        const f = await fixture(context)
        await f.run('prepare')
        await f.patch({ [protection]: true })
        await assert.rejects(
          f.run('publish'),
          /Main requires strict CI protection/u
        )
        const state = await f.state()
        assert.equal(state.merged, undefined)
        assert.equal(state.checked, undefined)
      }
    })
  }
)

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
  }
)
