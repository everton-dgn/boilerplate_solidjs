type ReleaseCheck = {
  head_sha: string
  details_url: string
  output: { title: string; summary: string }
}

export type OpenPull = {
  number: number
  state: string
  user: { login: string }
  head: { sha: string; ref: string; repo: { full_name: string } }
  base: { ref: string; repo: { full_name: string } }
}

export type StaleCommit = {
  sha: string
  tree: { sha: string }
  parents: { sha: string }[]
}

export type Artifact = Record<string, unknown>

export type State = {
  calls: string[]
  files?: Record<string, string>
  changedFiles?: string[]
  check?: ReleaseCheck
  hasFileModeChange?: boolean
  hasUnexpectedParent?: boolean
  hasTagRefFailure?: boolean
  hasDifferentMergeBase?: boolean
  shouldFailRelease?: boolean
  hasBadRun?: boolean
  hasAdvanced?: boolean
  hasRace?: boolean
  hasWrongTag?: boolean
  isUnprotected?: boolean
  isLoose?: boolean
  isChecked?: boolean
  isMerged?: boolean
  isDeleted?: boolean
  hasCleanupAdvanced?: boolean
  hasCleanupRace?: boolean
  release?: { tag_name: string }
  pr?: { state: string }
  closed?: number[]
  openPulls?: OpenPull[]
  commits?: Record<string, StaleCommit>
  notAncestors?: string[]
}
