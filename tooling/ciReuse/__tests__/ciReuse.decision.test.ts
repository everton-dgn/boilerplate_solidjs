/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

import { decideReuse } from '../decideReuse/index.ts'
import type { Ports } from '../types.ts'

const SHA_LENGTH = 40
const MERGE = 'c'.repeat(SHA_LENGTH)
const BASE = 'b'.repeat(SHA_LENGTH)
const HEAD = 'a'.repeat(SHA_LENGTH)
const TESTED = 'd'.repeat(SHA_LENGTH)
const TREE = 'e'.repeat(SHA_LENGTH)
const OTHER = 'f'.repeat(SHA_LENGTH)
const REPOSITORY = 'owner/repo'
const RUN_ID = 900
const ATTEMPT = 2
const REPOSITORY_ID = 7
const PR = 42
const ARTIFACT_ID = 55
const PAGE_SIZE = 100
const LOCK = new TextEncoder().encode('lockfile')
const HASH = createHash('sha256')
  .update(createHash('sha256').update(LOCK).digest())
  .digest('hex')
const RUNNER = { os: 'Linux', arch: 'X64', nodeArch: 'x64' }
const MANIFEST = JSON.stringify({
  devEngines: { runtime: { version: '24.22.0' } },
  packageManager: 'bun@1.4.3'
})
const ROOT = `repos/${REPOSITORY}`
const DEPENDENCY_KEY = `vite-plus-Linux-x64-bun-${HASH}`
const VALIDATION_PREFIX = `ci-validation-v2-Linux-X64-node-24.22.0-bun-1.4.3-${HASH}-`
const MAIN_REF = 'refs/heads/main'

type Repository = { full_name: string }
type RepositoryWithId = { id: number; full_name: string }
type BranchFixture = { ref: string; sha: string; repo: Repository }
type PullFixture = {
  number: number
  merged_at: string | null
  merge_commit_sha: string | null
  base: BranchFixture
  head: BranchFixture
}
type RunFixture = {
  id: number
  run_attempt: number
  event: string
  status: string
  conclusion: string
  head_sha: string
  head_branch: string
  path: string
  head_repository: Repository
  repository: RepositoryWithId
}
type JobFixture = {
  name: string
  run_attempt: number
  status: string
  conclusion: string
}
type ArtifactRunFixture = {
  id: number
  repository_id: number
  head_repository_id: number
  head_sha: string
}
type ArtifactFixture = {
  id: number
  name: string
  expired: boolean
  workflow_run: ArtifactRunFixture
}
type TreeFixture = { sha: string }
type CommitFixture = { tree: TreeFixture; parents: TreeFixture[] }
type CacheFixture = { key: string; ref: string }
type TimelineFixture = { event: string }
type World = {
  files: string[]
  parents: string
  pulls: PullFixture[]
  headPulls: PullFixture[]
  timeline: TimelineFixture[][]
  runs: RunFixture[]
  runCount: number
  jobs: JobFixture[]
  jobCount: number
  artifacts: ArtifactFixture[]
  tested: CommitFixture
  dependencyCaches: CacheFixture[]
  validationCaches: CacheFixture[]
  evidence: Record<string, unknown>
  calls: string[]
}
type FullOptions = { world: World; reason: RegExp }
type PullBuild = (pr: PullFixture) => PullFixture[]
type JobsVariant = (jobs: JobFixture[]) => JobFixture[]
type Route = [string, () => unknown]

function job(name: string): JobFixture {
  return {
    name,
    run_attempt: ATTEMPT,
    status: 'completed',
    conclusion: 'success'
  }
}

function pullRequest(): PullFixture {
  return {
    number: PR,
    merged_at: '2026-10-18T23:00:55Z',
    merge_commit_sha: MERGE,
    base: { ref: 'main', sha: BASE, repo: { full_name: REPOSITORY } },
    head: { ref: 'feat/x', sha: HEAD, repo: { full_name: REPOSITORY } }
  }
}

function workflowRun(): RunFixture {
  return {
    id: RUN_ID,
    run_attempt: ATTEMPT,
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    head_sha: HEAD,
    head_branch: 'feat/x',
    path: '.github/workflows/ci.yml',
    head_repository: { full_name: REPOSITORY },
    repository: { id: REPOSITORY_ID, full_name: REPOSITORY }
  }
}

function artifactRun(): ArtifactRunFixture {
  return {
    id: RUN_ID,
    repository_id: REPOSITORY_ID,
    head_repository_id: REPOSITORY_ID,
    head_sha: HEAD
  }
}

function artifact(): ArtifactFixture {
  return {
    id: ARTIFACT_ID,
    name: `ci-reuse-evidence-${ATTEMPT}`,
    expired: false,
    workflow_run: artifactRun()
  }
}

function createWorld(): World {
  const jobs = ['Quality', 'Tooling', 'E2E (fixtures)', 'E2E (production)'].map(
    name => job(name)
  )
  return {
    files: ['src/App.tsx'],
    parents: `${MERGE} ${BASE} ${HEAD}`,
    pulls: [pullRequest()],
    headPulls: [pullRequest()],
    timeline: [[{ event: 'committed' }, { event: 'merged' }]],
    runs: [workflowRun()],
    runCount: 1,
    jobs,
    jobCount: jobs.length,
    artifacts: [artifact()],
    tested: {
      tree: { sha: TREE },
      parents: [{ sha: BASE }, { sha: HEAD }]
    },
    dependencyCaches: [{ key: DEPENDENCY_KEY, ref: MAIN_REF }],
    validationCaches: [{ key: `${VALIDATION_PREFIX}1-1`, ref: MAIN_REF }],
    evidence: {
      version: 1,
      repository: REPOSITORY,
      run_id: RUN_ID,
      run_attempt: ATTEMPT,
      event: 'pull_request',
      workflow_ref: `${REPOSITORY}/.github/workflows/ci.yml@refs/pull/${PR}/merge`,
      workflow_sha: TESTED,
      github_sha: TESTED,
      pull_request: PR,
      base_ref: 'main',
      base_sha: BASE,
      head_sha: HEAD,
      tested_sha: TESTED,
      tested_tree: TREE,
      tested_parents: [BASE, HEAD]
    },
    calls: []
  }
}

function routes(world: World): Map<string, () => unknown> {
  const caches = `${ROOT}/actions/caches?ref=refs%2Fheads%2Fmain&key=`
  const timeline: Route[] = world.timeline.map((page, index) => [
    `${ROOT}/issues/${PR}/timeline?per_page=${PAGE_SIZE}&page=${index + 1}`,
    () => page
  ])
  return new Map<string, () => unknown>([
    [`${ROOT}/commits/${MERGE}/pulls?per_page=${PAGE_SIZE}`, () => world.pulls],
    [
      `${ROOT}/pulls?state=all&head=${encodeURIComponent('owner:feat/x')}&per_page=${PAGE_SIZE}`,
      () => world.headPulls
    ],
    ...timeline,
    [
      `${ROOT}/actions/workflows/ci.yml/runs?head_sha=${HEAD}&event=pull_request&per_page=${PAGE_SIZE}`,
      () => ({ total_count: world.runCount, workflow_runs: world.runs })
    ],
    [
      `${ROOT}/actions/runs/${RUN_ID}/attempts/${ATTEMPT}/jobs?per_page=${PAGE_SIZE}`,
      () => ({ total_count: world.jobCount, jobs: world.jobs })
    ],
    [
      `${ROOT}/actions/runs/${RUN_ID}/artifacts?name=ci-reuse-evidence-${ATTEMPT}&per_page=${PAGE_SIZE}`,
      () => ({
        total_count: world.artifacts.length,
        artifacts: world.artifacts
      })
    ],
    [`${ROOT}/git/commits/${TESTED}`, () => world.tested],
    [
      `${caches}${encodeURIComponent(DEPENDENCY_KEY)}&per_page=${PAGE_SIZE}`,
      () => ({ actions_caches: world.dependencyCaches })
    ],
    [
      `${caches}${encodeURIComponent(VALIDATION_PREFIX)}&per_page=${PAGE_SIZE}`,
      () => ({ actions_caches: world.validationCaches })
    ]
  ])
}

function gitOutput(world: World, args: string[]): string {
  const command = args.join(' ')
  if (command === `rev-list --parents -n 1 ${MERGE}`) return world.parents
  if (command === `rev-parse ${MERGE}^{tree}`) return TREE
  if (command === `show ${MERGE}:package.json`) return MANIFEST
  if (command.startsWith('diff ')) return world.files.join('\0')
  throw new Error(`Git inesperado: ${command}`)
}

function ports(world: World): Ports {
  const table = routes(world)
  return {
    api<T>(path: string): Promise<T> {
      world.calls.push(path)
      const route = table.get(path)
      if (!route) return Promise.reject(new Error(`Rota inesperada: ${path}`))
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Respostas sintéticas do GitHub.
      return Promise.resolve(route() as T)
    },
    git: args => Promise.resolve(gitOutput(world, args)),
    readBlob(spec) {
      assert.equal(spec, `${MERGE}:bun.lock`)
      return Promise.resolve(LOCK)
    },
    readEvidence(artifactId) {
      assert.equal(artifactId, ARTIFACT_ID)
      return Promise.resolve(world.evidence)
    }
  }
}

function decide(world: World) {
  return decideReuse({
    repository: REPOSITORY,
    sha: MERGE,
    runner: RUNNER,
    ports: ports(world)
  })
}

async function assertFull({ world, reason }: FullOptions) {
  const decision = await decide(world)
  assert.equal(decision.shouldReuse, false)
  assert.equal(decision.shouldRunQuality, true)
  assert.match(decision.reason, reason)
}

function fail(): never {
  throw new Error('não deveria ser chamado')
}

test('reutiliza quando a evidência e os jobs confirmam a mesma árvore', async () => {
  const world = createWorld()
  const decision = await decide(world)
  assert.deepEqual(decision, {
    shouldReuse: true,
    shouldRunQuality: false,
    reason: `Árvore ${TREE} validada pelo PR #${PR}.`,
    sourceRunUrl: `https://github.com/${REPOSITORY}/actions/runs/${RUN_ID}/attempts/${ATTEMPT}`
  })
  assert.ok(world.calls.includes(`${ROOT}/git/commits/${TESTED}`))
})

test('mantém o Quality quando lockfile, manifest ou bunfig mudam', async () => {
  for (const file of ['bun.lock', 'package.json', 'bunfig.toml']) {
    const world = createWorld()
    world.files = ['src/App.tsx', file]
    const decision = await decide(world)
    assert.equal(decision.shouldReuse, true)
    assert.equal(decision.shouldRunQuality, true)
    assert.ok(!world.calls.some(call => call.includes('/actions/caches')))
  }
})

test('mantém o Quality sem cache aplicável da main', async () => {
  const foreign = [{ key: DEPENDENCY_KEY, ref: 'refs/pull/1/merge' }]
  for (const key of ['dependencyCaches', 'validationCaches'] as const) {
    const world = createWorld()
    world[key] = foreign
    const decision = await decide(world)
    assert.equal(decision.shouldReuse, true)
    assert.equal(decision.shouldRunQuality, true)
  }
  const stale = createWorld()
  stale.validationCaches = [
    { key: VALIDATION_PREFIX.replace(HASH, OTHER), ref: MAIN_REF }
  ]
  const decision = await decide(stale)
  assert.equal(decision.shouldRunQuality, true)
})

test('roda tudo quando o merge altera o workflow, ações ou o verificador', async () => {
  for (const file of [
    '.github/workflows/ci.yml',
    '.github/actions/setup-project/action.yml',
    'tooling/ciReuse/decideReuse/index.ts'
  ]) {
    const world = createWorld()
    world.files = [file]
    await assertFull({ world, reason: /altera/u })
    assert.deepEqual(world.calls, [])
  }
})

test('rejeita commit que não é merge de dois parents', async () => {
  const world = createWorld()
  world.parents = `${MERGE} ${BASE}`
  await assertFull({ world, reason: /dois parents/u })
})

test('rejeita PR ausente, ambíguo, de fork ou com outra base', async () => {
  const builds: PullBuild[] = [
    () => [],
    pr => [pr, { ...pr, number: PR + 1 }],
    pr => [{ ...pr, head: { ...pr.head, repo: { full_name: 'fork/repo' } } }],
    pr => [{ ...pr, base: { ...pr.base, ref: 'develop' } }],
    pr => [{ ...pr, base: { ...pr.base, sha: OTHER } }],
    pr => [{ ...pr, merge_commit_sha: OTHER }],
    pr => [{ ...pr, merged_at: null }]
  ]
  for (const build of builds) {
    const world = createWorld()
    world.pulls = build(pullRequest())
    await assertFull({ world, reason: /PR/u })
  }
})

test('rejeita head com mais de um PR (empilhamento)', async () => {
  const world = createWorld()
  world.headPulls = [pullRequest(), { ...pullRequest(), number: 7 }]
  await assertFull({ world, reason: /mais de um PR/u })
})

test('aceita nome de branch reutilizado por PR antigo com outro head', async () => {
  const world = createWorld()
  const older = pullRequest()
  world.headPulls = [
    pullRequest(),
    { ...older, number: 7, head: { ...older.head, sha: OTHER } }
  ]
  const decision = await decide(world)
  assert.equal(decision.shouldReuse, true)
})

test('rejeita PR que mudou de base, inclusive na segunda página', async () => {
  const world = createWorld()
  world.timeline = [[{ event: 'base_ref_changed' }]]
  await assertFull({ world, reason: /mudou de base/u })

  const paged = createWorld()
  paged.timeline = [
    Array.from({ length: PAGE_SIZE }, () => ({ event: 'committed' })),
    [{ event: 'automatic_base_change_succeeded' }]
  ]
  await assertFull({ world: paged, reason: /mudou de base/u })
})

test('rejeita run ausente, duplicado, falho ou de outro workflow', async () => {
  const changes: Partial<RunFixture>[] = [
    { conclusion: 'failure' },
    { path: '.github/workflows/other.yml' },
    { event: 'push' },
    { head_branch: 'feat/y' },
    { head_repository: { full_name: 'fork/repo' } },
    { status: 'in_progress' },
    { run_attempt: 0 }
  ]
  for (const change of changes) {
    const world = createWorld()
    world.runs = [{ ...workflowRun(), ...change }]
    await assertFull({ world, reason: /run do PR/u })
  }
  const empty = createWorld()
  empty.runs = []
  empty.runCount = 0
  await assertFull({ world: empty, reason: /exatamente um run/u })
  const duplicated = createWorld()
  duplicated.runCount = 2
  await assertFull({ world: duplicated, reason: /exatamente um run/u })
})

test('exige os três jobs reutilizados na tentativa fixada', async () => {
  const variants: JobsVariant[] = [
    jobs => jobs.filter(item => item.name !== 'Tooling'),
    jobs =>
      jobs.map(item =>
        Object.assign(structuredClone(item), { run_attempt: 1 })
      ),
    jobs =>
      jobs.map(item =>
        Object.assign(structuredClone(item), { conclusion: 'skipped' })
      ),
    jobs => [...jobs, job('Quality')]
  ]
  for (const variant of variants) {
    const world = createWorld()
    world.jobs = variant(world.jobs)
    world.jobCount = world.jobs.length
    await assertFull({ world, reason: /job/u })
  }
  const truncated = createWorld()
  truncated.jobCount = PAGE_SIZE
  await assertFull({ world: truncated, reason: /incompleta/u })
})

test('rejeita PR antigo sem evidência e evidência de outro run', async () => {
  const missing = createWorld()
  missing.artifacts = []
  await assertFull({ world: missing, reason: /não tem a evidência/u })

  const changes: Partial<ArtifactFixture>[] = [
    { expired: true },
    { workflow_run: { ...artifactRun(), id: RUN_ID + 1 } },
    { workflow_run: { ...artifactRun(), head_repository_id: 99 } },
    { workflow_run: { ...artifactRun(), head_sha: OTHER } }
  ]
  for (const change of changes) {
    const world = createWorld()
    world.artifacts = [{ ...artifact(), ...change }]
    await assertFull({ world, reason: /não pertence/u })
  }
})

test('rejeita evidência divergente do run, PR ou merge', async () => {
  const changes: Record<string, unknown>[] = [
    { version: 2 },
    { run_attempt: 1 },
    { base_ref: 'develop' },
    { base_sha: OTHER },
    { tested_tree: OTHER },
    { workflow_ref: `${REPOSITORY}/.github/workflows/ci.yml@refs/heads/main` },
    { workflow_sha: OTHER },
    { github_sha: OTHER },
    { tested_parents: [OTHER, HEAD] },
    { tested_sha: 'nope' }
  ]
  for (const change of changes) {
    const world = createWorld()
    world.evidence = { ...world.evidence, ...change }
    await assertFull({ world, reason: /[Ee]vidência/u })
  }
})

test('confere o commit sintético pela API do GitHub', async () => {
  const commits: CommitFixture[] = [
    { tree: { sha: OTHER }, parents: [{ sha: BASE }, { sha: HEAD }] },
    { tree: { sha: TREE }, parents: [{ sha: OTHER }, { sha: HEAD }] }
  ]
  for (const commit of commits) {
    const world = createWorld()
    world.tested = commit
    await assertFull({ world, reason: /commit testado/u })
  }
})

test('qualquer falha de API ou de leitura resulta em CI completo', async () => {
  const world = createWorld()
  world.timeline = []
  await assertFull({ world, reason: /Rota inesperada/u })

  const invalid = await decideReuse({
    repository: 'invalid',
    sha: MERGE,
    runner: RUNNER,
    ports: { api: fail, git: fail, readBlob: fail, readEvidence: fail }
  })
  assert.equal(invalid.shouldReuse, false)
})
