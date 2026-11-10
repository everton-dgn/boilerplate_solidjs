import type { Ports } from '../types.ts'

type RepositoryName = { full_name: string }

type RepositoryIdentity = { id: number; full_name: string }

type BranchRef = { ref: string; sha: string; repo: RepositoryName | null }

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

type TreeRef = { sha: string }

type Job = {
  name: string
  run_attempt: number
  status: string
  conclusion: string | null
}

export type Runner = {
  os: string
  arch: string
  nodeArch: string
}

export type DecideReuseOptions = {
  repository: string
  sha: string
  runner: Runner
  ports: Ports
}

export type Decision = {
  shouldReuse: boolean
  shouldRunQuality: boolean
  reason: string
  sourceRunUrl?: string
}

export type Merge = {
  base: string
  head: string
  tree: string
}

export type Context = {
  repository: string
  sha: string
  ports: Ports
}

export type MergeContext = Context & { merge: Merge }

export type PullRequest = {
  number: number
  merged_at: string | null
  merge_commit_sha: string | null
  base: BranchRef
  head: BranchRef
}

export type PullContext = MergeContext & { pr: PullRequest }

export type WorkflowRun = {
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

export type WorkflowRuns = { total_count: number; workflow_runs: WorkflowRun[] }

export type RunContext = PullContext & { run: WorkflowRun }

export type Jobs = { total_count: number; jobs: Job[] }

export type Artifacts = { total_count: number; artifacts: Artifact[] }

export type GitCommit = { tree: TreeRef; parents: TreeRef[] }
