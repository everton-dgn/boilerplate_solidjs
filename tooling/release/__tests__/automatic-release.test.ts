/* oxlint-disable vitest/no-import-node-test -- Release tests use the native Node.js runner. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execPath } from 'node:process'
import { describe, it } from 'node:test'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const EXECUTABLE_MODE = 0o700
const SHA_LENGTH = 40
const HEAD = 'b'.repeat(SHA_LENGTH)
const script = path.resolve('tooling/release/automatic-release.ts')

// The subprocess PATH contains only these fake commands. No live Git or GitHub is reachable.
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
  if (['fetch', 'merge-base'].includes(command)) out('');
  else if (command === 'rev-parse') out(source);
  else if (command === 'tag') out('');
  else if (command === 'log') out(source + '\0feat: initial application\0');
  else if (command === 'diff') out('CHANGELOG.md\npackage.json');
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
  if (endpoint === root + '/actions/runs/1') value = { conclusion: s.badRun ? 'failure' : 'success', event: 'push', head_branch: 'main', head_sha: source, path: '.github/workflows/ci.yml', head_repository: { full_name: 'owner/repo' } };
  else if (endpoint === root + '/git/ref/heads/main') value = { object: { sha: s.advanced ? 'e'.repeat(40) : s.merged ? merge : source } };
  else if (endpoint === root + '/rules/branches/main?per_page=100') value = s.unprotected ? [] : [{type:'pull_request'}, {type:'required_status_checks', parameters:{strict_required_status_checks_policy: !s.loose, required_status_checks:[{context:'CI required',integration_id:15368}]}}];
  else if (endpoint === root + '/check-runs') {
    if (body.name !== 'CI required' || body.head_sha !== head || body.conclusion !== 'success') throw Error('Wrong validated commit');
    s.checked = true; value = {id:1};
  }
  else if (endpoint.startsWith(root + '/git/ref/heads/release/')) value = s.ref === null ? undefined : s.release && s.cleanupAdvanced ? {object:{sha:source}} : s.ref;
  else if (endpoint === root + '/git/commits/' + source) value = { sha: source, tree: { sha: 'base-tree' }, parents: [] };
  else if (endpoint === root + '/git/commits/' + head) value = { sha: head, tree: { sha: 'release-tree' }, parents: [{sha: source}] };
  else if (endpoint === root + '/git/commits/' + merge) value = { sha: merge, tree: { sha: s.race ? 'wrong-tree' : 'release-tree' }, parents: [{sha: source}, {sha: head}] };
  else if (endpoint === root + '/git/trees') { s.files = Object.fromEntries(body.tree.map(f => [f.path, f.content])); value = {sha: 'release-tree'}; }
  else if (endpoint === root + '/git/commits') value = {sha: head};
  else if (endpoint === root + '/git/refs') {
    if (body.ref.startsWith('refs/heads/')) { s.branch = body.ref.slice(11); value = s.ref = {object: {sha: head, type: 'commit'}}; }
    else value = s.tagRef = {object: {sha: tag, type: 'tag'}};
  }
  else if (endpoint.startsWith(root + '/pulls?')) value = s.pr ? [{number:s.pr.number}] : [];
  else if (endpoint === root + '/pulls') value = s.pr = {number: 1, state: 'open', merged: false, merge_commit_sha: null, user: {login: 'github-actions[bot]'}, head: {sha: head, ref: s.branch, repo: {full_name: 'owner/repo'}}, base: {ref: 'main', repo: {full_name: 'owner/repo'}}};
  else if (endpoint === root + '/pulls/1') value = s.pr;
  else if (endpoint === root + '/pulls/1/merge') {
    if (body.merge_method !== 'merge' || body.sha !== head) throw Error('Unsafe merge');
    // GitHub rejects a stale PR at the mutation boundary when strict checks apply.
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

interface State {
  calls: string[]
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
}

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'solid-release-test-'))
  const statePath = path.join(directory, 'state.json')
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
  return {
    directory,
    async state(): Promise<State> {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- State is written exclusively by this synthetic CLI.
      return JSON.parse(await readFile(statePath, 'utf8')) as State
    },
    async patch(patch: Partial<State>) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Synthetic fixture state only.
      const state = JSON.parse(await readFile(statePath, 'utf8')) as State
      await writeFile(statePath, JSON.stringify({ ...state, ...patch }))
    },
    async run(mode: string) {
      return execute(execPath, [script], {
        env: {
          PATH: directory,
          FAKE_STATE: statePath,
          GITHUB_REPOSITORY: 'owner/repo',
          RELEASE_SOURCE_RUN_ID: '1',
          RELEASE_MODE: mode,
          RELEASE_HEAD: HEAD,
          GITHUB_OUTPUT: path.join(directory, 'output'),
          GH_TOKEN: 'synthetic'
        }
      })
    }
  }
}

describe(
  'release orchestration with isolated Git and GitHub',
  { timeout: 30_000, concurrency: true },
  () => {
    it('recovers after a release API failure without recreating commit, PR, merge or tag', async () => {
      const f = await fixture()
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
        // Fixtures contain synthetic data only and remain in the OS temporary directory.
        assert.ok(f.directory.startsWith(tmpdir()))
      }
    })

    it('preserves a release branch updated before or during cleanup', async () => {
      for (const patch of [{ cleanupAdvanced: true }, { cleanupRace: true }]) {
        const f = await fixture()
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

    it('stops on invalid CI and main advancing before merge', async () => {
      const f = await fixture()
      try {
        await f.patch({ badRun: true })
        await assert.rejects(f.run('prepare'), /successful push CI/u)
        await f.patch({ badRun: false })
        await f.run('prepare')
        await f.patch({ advanced: true })
        await assert.rejects(f.run('publish'), /Main advanced/u)
        const state = await f.state()
        assert.equal(
          state.calls.includes('PUT repos/owner/repo/pulls/1/merge'),
          false
        )
      } finally {
        // Fixtures contain synthetic data only and remain in the OS temporary directory.
        assert.ok(f.directory.startsWith(tmpdir()))
      }
    })

    it('does not mutate main if it advances at the protected merge boundary', async () => {
      const f = await fixture()
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
        // Fixtures contain synthetic data only and remain in the OS temporary directory.
        assert.ok(f.directory.startsWith(tmpdir()))
      }
    })

    it('refuses merge when main is unprotected or its CI requirement is loose', async () => {
      for (const protection of ['unprotected', 'loose'] as const) {
        const f = await fixture()
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
