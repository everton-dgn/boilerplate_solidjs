import type { PullRequest } from './github.ts'
import type { ValidatedRelease } from './plan-artifact.ts'

export type GitCommit = {
  sha: string
  tree: { sha: string }
  parents: { sha: string }[]
  author: { date: string }
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
