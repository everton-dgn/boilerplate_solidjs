import { hasMainCaches } from './hasMainCaches/index.ts'
import type {
  DecideReuseOptions,
  Decision,
  Merge,
  Context,
  MergeContext,
  PullRequest,
  PullContext,
  WorkflowRun,
  WorkflowRuns,
  RunContext,
  Jobs,
  Artifacts,
  GitCommit
} from './types.ts'

const SHA_PATTERN = /^[a-f\d]{40}$/u
const REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/u
const MAIN_BRANCH = 'main'

const WORKFLOW_PATH = '.github/workflows/ci.yml'
const EVIDENCE_VERSION = 2
const EVIDENCE_PREFIX = 'ci-reuse-evidence-'

const PAGE_SIZE = 100
const MERGE_PARENT_COUNT = 2
const REUSED_JOBS = ['Quality', 'Tooling', 'E2E (fixtures)']
// O verificador não pode aprovar a própria mudança nem a do workflow que o executa.
const FULL_CI_PREFIXES = ['.github/', 'tooling/ciReuse/']
// Lockfile e toolchain geram chaves novas de cache, que só o Quality grava.
const QUALITY_FILES = new Set(['bun.lock', 'package.json', 'bunfig.toml'])

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

// A API do artifact já fixa run, tentativa e head, e assertTestedCommit confere
// árvore e parents; a evidência só aponta o commit testado.
function assertEvidence(evidence: unknown): string {
  if (typeof evidence !== 'object' || evidence === null) {
    reject('Evidência ilegível.')
  }
  const fields = new Map<string, unknown>(Object.entries(evidence))
  if (fields.get('version') !== EVIDENCE_VERSION) {
    reject('A evidência vem de outra versão do workflow.')
  }
  const tested = fields.get('tested_sha')
  if (typeof tested !== 'string' || !SHA_PATTERN.test(tested)) {
    reject('A evidência não traz o SHA testado.')
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
  const run = await findRun({ ...context, merge, pr })
  const runContext = { ...context, merge, pr, run }
  await assertJobs(runContext)
  const artifact = await findEvidence(runContext)
  const tested = assertEvidence(await ports.readEvidence(artifact))
  await assertTestedCommit(runContext, tested)
  const hasQualityChanges = files.some(file => QUALITY_FILES.has(file))
  const shouldRunQuality =
    hasQualityChanges || !(await hasMainCaches({ ...context, runner }))
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
