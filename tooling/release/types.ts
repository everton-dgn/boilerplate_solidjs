type ReleaseFile = {
  path: string
  content: string
}

export type Commit = {
  sha: string
  message: string
}

export type ReleasePlan = {
  version: string
  tag: string
  notes: string
  changelog: string
}

export type ReleaseContext = {
  repository: string
  source: string
  root: string
  date: string
  manifest: Record<string, unknown>
}

export type PullRequest = {
  number: number
  state: string
  merged: boolean
  merge_commit_sha: string | null
  user: { login: string }
  head: { sha: string; ref: string; repo: { full_name: string } }
  base: { ref: string; repo: { full_name: string } }
}

export type ValidatedRelease = {
  plan: ReleasePlan
  files: ReleaseFile[]
}

export type GitCommit = {
  sha: string
  tree: { sha: string }
  parents: { sha: string }[]
}

export type GitReference = {
  object: { sha: string; type: string }
}

export type Prepared = {
  release: ValidatedRelease
  branch: string
  head: string
  pr: PullRequest
}
