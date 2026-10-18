import { createHash } from 'node:crypto'

import type { Ports } from '../types.ts'

const SHA_PATTERN = /^[a-f\d]{40}$/u
const REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/u
const MAIN_BRANCH = 'main'
const MAIN_REF = 'refs/heads/main'
const WORKFLOW_PATH = '.github/workflows/ci.yml'
const EVIDENCE_VERSION = 1
const EVIDENCE_PREFIX = 'ci-reuse-evidence-'
const VALIDATION_CACHE_PREFIX = 'ci-validation-v2-'
const DEPENDENCY_CACHE_PREFIX = 'vite-plus-'
const PAGE_SIZE = 100
const MAX_TIMELINE_PAGES = 10
const MERGE_PARENT_COUNT = 2
const REUSED_JOBS = ['Quality', 'Tooling', 'E2E (fixtures)']
// O verificador não pode aprovar a própria mudança nem a do workflow que o executa.
const FULL_CI_PREFIXES = ['.github/', 'tooling/ciReuse/']
// Lockfile e toolchain geram chaves novas de cache, que só o Quality grava.
const QUALITY_FILES = new Set(['bun.lock', 'package.json', 'bunfig.toml'])
const RETARGET_EVENTS = new Set([
  'base_ref_changed',
  'base_ref_force_pushed',
  'base_ref_deleted',
  'automatic_base_change_succeeded',
  'automatic_base_change_failed'
])

type Runner = {
  os: string
  arch: string
  nodeArch: string
}
type DecideReuseOptions = {
  repository: string
  sha: string
  runner: Runner
  ports: Ports
}
type Decision = {
  shouldReuse: boolean
  shouldRunQuality: boolean
  reason: string
  sourceRunUrl?: string
}
type Merge = {
  base: string
  head: string
  tree: string
}
type Context = {
  repository: string
  sha: string
  ports: Ports
}
type MergeContext = Context & { merge: Merge }
type RepositoryName = { full_name: string }
type RepositoryIdentity = { id: number; full_name: string }
type BranchRef = { ref: string; sha: string; repo: RepositoryName | null }
type PullRequest = {
  number: number
  merged_at: string | null
  merge_commit_sha: string | null
  base: BranchRef
  head: BranchRef
}
type PullContext = MergeContext & { pr: PullRequest }
type TimelineEvent = { event?: string }
type TimelineOptions = Context & { pr: number; page: number }
type WorkflowRun = {
  id: number
  run_attempt: number
  event: string
  status: string
  conclusion: string | null
  head_sha: string
  head_branch: string | null
  path: string
  head_repository: RepositoryName | null
  repository: RepositoryIdentity
}
type WorkflowRuns = { total_count: number; workflow_runs: WorkflowRun[] }
type RunContext = PullContext & { run: WorkflowRun }
type Job = {
  name: string
  run_attempt: number
  status: string
  conclusion: string | null
}
type Jobs = { total_count: number; jobs: Job[] }
type ArtifactRun = {
  id: number
  repository_id: number
  head_repository_id: number
  head_sha: string
}
type Artifact = {
  id: number
  name: string
  expired: boolean
  workflow_run: ArtifactRun | null
}
type Artifacts = { total_count: number; artifacts: Artifact[] }
type TreeRef = { sha: string }
type GitCommit = { tree: TreeRef; parents: TreeRef[] }
type ActionsCache = { key: string; ref: string }
type ActionsCaches = { actions_caches: ActionsCache[] }
type RuntimeEngine = { version?: unknown }
type DevEngines = { runtime?: RuntimeEngine }
type Manifest = { devEngines?: DevEngines; packageManager?: unknown }
type CacheOptions = Context & { runner: Runner }
type CacheLookup = Context & { key: string; isPrefix: boolean }

function reject(reason: string): never {
  throw new Error(reason)
}

function full(reason: string): Decision {
  return { shouldReuse: false, shouldRunQuality: true, reason }
}

async function readMerge({ sha, ports }: Context): Promise<Merge> {
  const line = await ports.git(['rev-list', '--parents', '-n', '1', sha])
  const [commit, ...parents] = line.split(' ')
  const [base = '', head = ''] = parents
  if (commit !== sha || parents.length !== MERGE_PARENT_COUNT) {
    reject('O commit da main não é um merge de dois parents.')
  }
  if (!SHA_PATTERN.test(base) || !SHA_PATTERN.test(head)) {
    reject('Parents inválidos no merge da main.')
  }
  const tree = await ports.git(['rev-parse', `${sha}^{tree}`])
  return { base, head, tree }
}

async function changedFiles({ merge, sha, ports }: MergeContext) {
  const output = await ports.git([
    'diff',
    '--no-renames',
    '--name-only',
    '-z',
    merge.base,
    sha,
    '--'
  ])
  return output.split('\0').filter(Boolean)
}

async function findPullRequest({
  repository,
  sha,
  merge,
  ports
}: MergeContext): Promise<PullRequest> {
  const pulls = await ports.api<PullRequest[]>(
    `repos/${repository}/commits/${sha}/pulls?per_page=${PAGE_SIZE}`
  )
  const merged = pulls.filter(
    pr => pr.merged_at !== null && pr.merge_commit_sha === sha
  )
  if (merged.length !== 1 || !merged[0]) {
    reject('O merge não corresponde a exatamente um PR integrado.')
  }
  const [pr] = merged
  if (
    pr.base.ref !== MAIN_BRANCH ||
    pr.base.repo?.full_name !== repository ||
    pr.head.repo?.full_name !== repository
  ) {
    reject('O PR não é do mesmo repositório com base na main.')
  }
  if (pr.base.sha !== merge.base || pr.head.sha !== merge.head) {
    reject('Base ou head do PR diferem dos parents do merge.')
  }
  return pr
}

async function assertSinglePullRequest({ repository, pr, ports }: PullContext) {
  const [owner] = repository.split('/')
  const head = encodeURIComponent(`${owner}:${pr.head.ref}`)
  const pulls = await ports.api<PullRequest[]>(
    `repos/${repository}/pulls?state=all&head=${head}&per_page=${PAGE_SIZE}`
  )
  if (pulls.length !== 1 || pulls[0]?.number !== pr.number) {
    reject('A branch do PR tem mais de um PR associado.')
  }
}

async function assertNoRetarget(options: TimelineOptions): Promise<void> {
  if (options.page > MAX_TIMELINE_PAGES) {
    reject('A timeline do PR excede o limite verificado.')
  }
  const events = await options.ports.api<TimelineEvent[]>(
    `repos/${options.repository}/issues/${options.pr}/timeline?per_page=${PAGE_SIZE}&page=${options.page}`
  )
  if (events.some(item => RETARGET_EVENTS.has(item.event ?? ''))) {
    reject('O PR mudou de base.')
  }
  if (events.length === PAGE_SIZE) {
    await assertNoRetarget({ ...options, page: options.page + 1 })
  }
}

async function findRun({
  repository,
  merge,
  pr,
  ports
}: PullContext): Promise<WorkflowRun> {
  const runs = await ports.api<WorkflowRuns>(
    `repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${merge.head}&event=pull_request&per_page=${PAGE_SIZE}`
  )
  if (runs.total_count !== 1 || runs.workflow_runs.length !== 1) {
    reject('O head do PR não tem exatamente um run de CI.')
  }
  const [run] = runs.workflow_runs
  if (
    !run ||
    run.path !== WORKFLOW_PATH ||
    run.event !== 'pull_request' ||
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    run.head_sha !== merge.head ||
    run.head_branch !== pr.head.ref ||
    run.head_repository?.full_name !== repository ||
    run.repository.full_name !== repository ||
    !Number.isInteger(run.run_attempt) ||
    run.run_attempt < 1
  ) {
    reject('O run do PR não é um CI aprovado deste repositório.')
  }
  return run
}

async function assertJobs({ repository, run, ports }: RunContext) {
  const jobs = await ports.api<Jobs>(
    `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=${PAGE_SIZE}`
  )
  if (jobs.total_count !== jobs.jobs.length) {
    reject('A lista de jobs do run veio incompleta.')
  }
  for (const name of REUSED_JOBS) {
    const matches = jobs.jobs.filter(job => job.name === name)
    const [job] = matches
    if (
      matches.length !== 1 ||
      !job ||
      job.run_attempt !== run.run_attempt ||
      job.status !== 'completed' ||
      job.conclusion !== 'success'
    ) {
      reject(`O job ${name} não passou na tentativa verificada.`)
    }
  }
}

async function findEvidence({
  repository,
  merge,
  run,
  ports
}: RunContext): Promise<number> {
  const name = `${EVIDENCE_PREFIX}${run.run_attempt}`
  const list = await ports.api<Artifacts>(
    `repos/${repository}/actions/runs/${run.id}/artifacts?name=${name}&per_page=${PAGE_SIZE}`
  )
  const matches = list.artifacts.filter(artifact => artifact.name === name)
  const [artifact] = matches
  if (matches.length !== 1 || !artifact) {
    reject('O run do PR não tem a evidência da árvore testada.')
  }
  const source = artifact.workflow_run
  if (
    artifact.expired ||
    source?.id !== run.id ||
    source.head_sha !== merge.head ||
    source.repository_id !== run.repository.id ||
    source.head_repository_id !== run.repository.id
  ) {
    reject('A evidência não pertence ao run verificado.')
  }
  return artifact.id
}

function assertEvidence(context: RunContext, evidence: unknown): string {
  if (typeof evidence !== 'object' || evidence === null) {
    reject('Evidência ilegível.')
  }
  const { repository, merge, pr, run } = context
  const fields = new Map<string, unknown>(Object.entries(evidence))
  const expected = {
    version: EVIDENCE_VERSION,
    repository,
    run_id: run.id,
    run_attempt: run.run_attempt,
    event: 'pull_request',
    workflow_ref: `${repository}/${WORKFLOW_PATH}@refs/pull/${pr.number}/merge`,
    pull_request: pr.number,
    base_ref: MAIN_BRANCH,
    base_sha: merge.base,
    head_sha: merge.head,
    tested_tree: merge.tree
  }
  for (const [key, value] of Object.entries(expected)) {
    if (fields.get(key) !== value) reject(`Evidência divergente em ${key}.`)
  }
  const tested = fields.get('tested_sha')
  const parents = fields.get('tested_parents')
  if (
    typeof tested !== 'string' ||
    !SHA_PATTERN.test(tested) ||
    fields.get('github_sha') !== tested ||
    fields.get('workflow_sha') !== tested ||
    !Array.isArray(parents) ||
    parents.join(' ') !== `${merge.base} ${merge.head}`
  ) {
    reject('A evidência não descreve o merge testado.')
  }
  return tested
}

async function assertTestedCommit(context: RunContext, tested: string) {
  const commit = await context.ports.api<GitCommit>(
    `repos/${context.repository}/git/commits/${tested}`
  )
  const parents = commit.parents.map(parent => parent.sha).join(' ')
  if (
    commit.tree.sha !== context.merge.tree ||
    parents !== `${context.merge.base} ${context.merge.head}`
  ) {
    reject('O commit testado no PR difere do merge da main.')
  }
}

function digest(value: Uint8Array): Buffer {
  return createHash('sha256').update(value).digest()
}

async function hasMainCache({ repository, key, isPrefix, ports }: CacheLookup) {
  const query = encodeURIComponent(key)
  const caches = await ports.api<ActionsCaches>(
    `repos/${repository}/actions/caches?ref=${encodeURIComponent(MAIN_REF)}&key=${query}&per_page=${PAGE_SIZE}`
  )
  return caches.actions_caches.some(
    cache =>
      cache.ref === MAIN_REF &&
      (isPrefix ? cache.key.startsWith(key) : cache.key === key)
  )
}

async function hasMainCaches({ sha, runner, ...context }: CacheOptions) {
  const { ports } = context
  // Mesmo valor de hashFiles('bun.lock') nas chaves do workflow.
  const lock = digest(digest(await ports.readBlob(`${sha}:bun.lock`)))
  const hash = lock.toString('hex')
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Os campos lidos são validados abaixo.
  const manifest = JSON.parse(
    await ports.git(['show', `${sha}:package.json`])
  ) as Manifest
  const node = manifest.devEngines?.runtime?.version
  const packageManager =
    typeof manifest.packageManager === 'string' ? manifest.packageManager : ''
  const bun = /^bun@(?<version>[^+]+)/u.exec(packageManager)?.groups?.version
  if (typeof node !== 'string' || !bun) {
    reject('Versões de Node ou Bun ausentes no package.json.')
  }
  const dependencies = `${DEPENDENCY_CACHE_PREFIX}${runner.os}-${runner.nodeArch}-bun-${hash}`
  const validation = `${VALIDATION_CACHE_PREFIX}${runner.os}-${runner.arch}-node-${node}-bun-${bun}-${hash}-`
  const lookups = [
    { ...context, sha, key: dependencies, isPrefix: false },
    { ...context, sha, key: validation, isPrefix: true }
  ]
  const results = await Promise.all(lookups.map(lookup => hasMainCache(lookup)))
  return results.every(Boolean)
}

async function verify(options: DecideReuseOptions): Promise<Decision> {
  const { repository, sha, ports, runner } = options
  if (!REPOSITORY_PATTERN.test(repository) || !SHA_PATTERN.test(sha)) {
    return full('Repositório ou SHA inválido.')
  }
  const context = { repository, sha, ports }
  const merge = await readMerge(context)
  const files = await changedFiles({ ...context, merge })
  const critical = files.find(file =>
    FULL_CI_PREFIXES.some(prefix => file.startsWith(prefix))
  )
  if (critical) return full(`O merge altera ${critical}.`)
  const pr = await findPullRequest({ ...context, merge })
  await assertSinglePullRequest({ ...context, merge, pr })
  await assertNoRetarget({ ...context, pr: pr.number, page: 1 })
  const run = await findRun({ ...context, merge, pr })
  const runContext = { ...context, merge, pr, run }
  await assertJobs(runContext)
  const artifact = await findEvidence(runContext)
  const tested = assertEvidence(runContext, await ports.readEvidence(artifact))
  await assertTestedCommit(runContext, tested)
  const changesQuality = files.some(file => QUALITY_FILES.has(file))
  const shouldRunQuality =
    changesQuality || !(await hasMainCaches({ ...context, runner }))
  return {
    shouldReuse: true,
    shouldRunQuality,
    reason: `Árvore ${merge.tree} validada pelo PR #${pr.number}${shouldRunQuality ? '; Quality roda para o cache da main' : ''}.`,
    sourceRunUrl: `https://github.com/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}`
  }
}

export async function decideReuse(
  options: DecideReuseOptions
): Promise<Decision> {
  try {
    return await verify(options)
  } catch (error) {
    return full(error instanceof Error ? error.message : 'Falha inesperada.')
  }
}
