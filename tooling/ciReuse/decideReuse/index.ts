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

type TestedCommitOptions = RunContext & { tested: string }

const SHA_PATTERN = /^[a-f\d]{40}$/u
const REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/u
const MAIN_BRANCH = 'main'

const WORKFLOW_PATH = '.github/workflows/ci.yml'
const EVIDENCE_VERSION = 2
const EVIDENCE_PREFIX = 'ci-reuse-evidence-'

const PAGE_SIZE = 100
const MERGE_PARENT_COUNT = 2
const REUSED_JOBS = ['Quality', 'Tooling', 'E2E (fixtures)']
// The verifier cannot approve its own change nor the one of the workflow that runs it.
const FULL_CI_PREFIXES = ['.github/', 'tooling/ciReuse/']
// Lockfile and toolchain generate new cache keys, which only Quality writes.
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
    reject('The main commit is not a merge of two parents.')
  }
  if (!SHA_PATTERN.test(base) || !SHA_PATTERN.test(head)) {
    reject('Invalid parents in the main merge.')
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
    reject('The merge does not match exactly one merged PR.')
  }
  const [pr] = merged
  if (
    pr.base.ref !== MAIN_BRANCH ||
    pr.base.repo?.full_name !== repository ||
    pr.head.repo?.full_name !== repository
  ) {
    reject('The PR is not from the same repository with main as its base.')
  }
  if (pr.base.sha !== merge.base || pr.head.sha !== merge.head) {
    reject('The base or head of the PR differs from the parents of the merge.')
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
    reject('The PR head does not have exactly one CI run.')
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
    reject('The PR run is not a passing CI of this repository.')
  }
  return run
}

async function assertJobs({ repository, run, ports }: RunContext) {
  const jobs = await ports.api<Jobs>(
    `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=${PAGE_SIZE}`
  )
  if (jobs.total_count !== jobs.jobs.length) {
    reject('The job list of the run came back incomplete.')
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
      reject(`The ${name} job did not pass in the checked attempt.`)
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
    reject('The PR run does not have the evidence of the tested tree.')
  }
  const source = artifact.workflow_run
  if (
    artifact.expired ||
    source?.id !== run.id ||
    source.head_sha !== merge.head ||
    source.repository_id !== run.repository.id ||
    source.head_repository_id !== run.repository.id
  ) {
    reject('The evidence does not belong to the checked run.')
  }
  return artifact.id
}

// The artifact API already pins the run, the attempt and the head, and
// assertTestedCommit checks the tree and the parents; the evidence only points to
// the tested commit.
function assertEvidence(evidence: unknown): string {
  if (typeof evidence !== 'object' || evidence === null) {
    reject('Unreadable evidence.')
  }
  const fields = new Map<string, unknown>(Object.entries(evidence))
  if (fields.get('version') !== EVIDENCE_VERSION) {
    reject('The evidence comes from another version of the workflow.')
  }
  const tested = fields.get('tested_sha')
  if (typeof tested !== 'string' || !SHA_PATTERN.test(tested)) {
    reject('The evidence does not carry the tested SHA.')
  }
  return tested
}

async function assertTestedCommit({
  tested,
  repository,
  merge,
  ports
}: TestedCommitOptions) {
  const commit = await ports.api<GitCommit>(
    `repos/${repository}/git/commits/${tested}`
  )
  const parents = commit.parents.map(parent => parent.sha).join(' ')
  if (
    commit.tree.sha !== merge.tree ||
    parents !== `${merge.base} ${merge.head}`
  ) {
    reject('The commit tested in the PR differs from the main merge.')
  }
}

async function verify(options: DecideReuseOptions): Promise<Decision> {
  const { repository, sha, ports, runner } = options
  if (!REPOSITORY_PATTERN.test(repository) || !SHA_PATTERN.test(sha)) {
    return full('Invalid repository or SHA.')
  }
  const context = { repository, sha, ports }
  const merge = await readMerge(context)
  const files = await changedFiles({ ...context, merge })
  const critical = files.find(file =>
    FULL_CI_PREFIXES.some(prefix => file.startsWith(prefix))
  )
  if (critical) return full(`The merge changes ${critical}.`)
  const pr = await findPullRequest({ ...context, merge })
  const run = await findRun({ ...context, merge, pr })
  const runContext = { ...context, merge, pr, run }
  await assertJobs(runContext)
  const artifact = await findEvidence(runContext)
  const tested = assertEvidence(await ports.readEvidence(artifact))
  await assertTestedCommit({ ...runContext, tested })
  const hasQualityChanges = files.some(file => QUALITY_FILES.has(file))
  const shouldRunQuality =
    hasQualityChanges || !(await hasMainCaches({ ...context, runner }))
  return {
    shouldReuse: true,
    shouldRunQuality,
    reason: `Tree ${merge.tree} validated by PR #${pr.number}${shouldRunQuality ? '; Quality runs for the main cache' : ''}.`,
    sourceRunUrl: `https://github.com/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}`
  }
}

export async function decideReuse(
  options: DecideReuseOptions
): Promise<Decision> {
  try {
    return await verify(options)
  } catch (error) {
    return full(error instanceof Error ? error.message : 'Unexpected failure.')
  }
}
