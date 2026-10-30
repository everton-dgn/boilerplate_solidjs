import { REQUIRED_CHECK } from './constants.ts'
import { api, git, requireSha } from './github.ts'
import type { GitReference, ReleaseContext } from './types.ts'

const GITHUB_ACTIONS_APP_ID = 15_368

type BranchRule = {
  type: string
  parameters?: {
    strict_required_status_checks_policy?: boolean
    required_status_checks?: { context: string; integration_id: number }[]
  }
}

type Ancestry = {
  ancestor: string
  descendant: string
}

export async function mainSha(ctx: ReleaseContext): Promise<string> {
  const ref = await api<GitReference>(`${ctx.root}/git/ref/heads/main`)
  return requireSha(ref.object.sha)
}

export async function assertMainProtection(ctx: ReleaseContext): Promise<void> {
  const rules = await api<BranchRule[]>(
    `${ctx.root}/rules/branches/main?per_page=100`
  )
  const hasPullRequestRule = rules.some(rule => rule.type === 'pull_request')
  const hasStrictCi = rules.some(
    rule =>
      rule.type === 'required_status_checks' &&
      rule.parameters?.strict_required_status_checks_policy === true &&
      rule.parameters.required_status_checks?.some(
        check =>
          check.context === REQUIRED_CHECK &&
          check.integration_id === GITHUB_ACTIONS_APP_ID
      )
  )
  if (!hasPullRequestRule || !hasStrictCi) {
    throw new Error(
      'Main requires strict CI protection before release merge. Configure the CI required check from GitHub Actions with an up-to-date branch before preparing a release.'
    )
  }
}

export async function isAncestor({
  ancestor,
  descendant
}: Ancestry): Promise<boolean> {
  try {
    await git('merge-base', '--is-ancestor', ancestor, descendant)
    return true
  } catch {
    return false
  }
}
