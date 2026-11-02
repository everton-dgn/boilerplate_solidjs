import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execPath } from 'node:process'
import type { TestContext } from 'node:test'
import { promisify } from 'node:util'

import { HEAD } from './constants.ts'
import type { State, Artifact } from './types.ts'

type CommandResult = { stdout: string; stderr: string }

type ReleaseFixture = {
  directory: string
  plan: () => Promise<void>
  state: () => Promise<State>
  patch: (patch: Partial<State>) => Promise<void>
  artifact: () => Promise<Artifact>
  replaceArtifact: (artifact: Artifact) => Promise<void>
  lastOutput: (name: string) => Promise<string | undefined>
  summary: () => Promise<string>
  run: (mode: string) => Promise<CommandResult>
}

const execute = promisify(execFile)
const EXECUTABLE_MODE = 0o700
const script = path.resolve('tooling/release/automatic-release.ts')
const planScript = path.resolve('tooling/release/plan-release.ts')

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
  // O checkout não guarda credenciais: fetch e push só chegam ao remoto pelo helper do gh.
  const helper = ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential'];
  const isAuthenticated = helper.every((value, index) => args[index] === value);
  const [command, ...rest] = isAuthenticated ? args.slice(helper.length) : args;
  if (['fetch', 'push'].includes(command) && !isAuthenticated) throw Error('Unauthenticated remote access');
  if (command === 'push') {
    const ref = 'refs/heads/' + s.branch;
    if (!s.release || !rest.includes('--force-with-lease=' + ref + ':' + head) || !rest.includes(':' + ref)) throw Error('Unsafe cleanup');
    if (s.cleanupRace) { save(); process.exitCode = 1; return; }
    s.ref = null; s.deleted = true; out(''); return;
  }
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

export async function fixture(context: TestContext): Promise<ReleaseFixture> {
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

export function mutations(state: State): string[] {
  return state.calls.filter(call => !call.startsWith('GET '))
}
