import { appendFile } from 'node:fs/promises'
import { env } from 'node:process'

import {
  appendOutput,
  readContext,
  readSourcePlan,
  requiredEnv,
  type ReleaseContext
} from './context.ts'
import {
  api,
  assertReleaseFiles,
  assertReleasePullRequest,
  command,
  isOpenReleasePullRequest,
  mutate,
  optionalApi,
  requireSha,
  type PullRequest
} from './github.ts'
import {
  assertPlanArtifact,
  readPlanArtifact,
  type ValidatedRelease
} from './plan-artifact.ts'

// Este script roda nos jobs com escrita: usa só Git, gh e módulos nativos. A
// formatação com o Vite+ fica no job de leitura (plan-release.ts).
const BRANCH_SHA_LENGTH = 12
const MERGE_PARENT_COUNT = 2
const GITHUB_ACTIONS_APP_ID = 15_368
const REQUIRED_CHECK = 'CI required'
const BOT = {
  name: 'github-actions[bot]',
  email: '41898282+github-actions[bot]@users.noreply.github.com'
}

type GitCommit = {
  sha: string
  tree: { sha: string }
  parents: { sha: string }[]
  author: { date: string }
}
type GitReference = {
  object: { sha: string; type: string }
}
type Prepared = {
  release: ValidatedRelease
  branch: string
  head: string
  pr: PullRequest
}
type BranchRule = {
  type: string
  parameters?: {
    strict_required_status_checks_policy?: boolean
    required_status_checks?: { context: string; integration_id: number }[]
  }
}
type ReleaseRequest = {
  ctx: ReleaseContext
  release: ValidatedRelease
}
type HeadCheck = ReleaseRequest & { head: string }
type BranchRequest = ReleaseRequest & { branch: string }
type PrepareOptions = ReleaseRequest & { shouldCreate: boolean }
type PullRequestTarget = {
  ctx: ReleaseContext
  pr: PullRequest
}
type ObsoleteSearch = {
  ctx: ReleaseContext
  branch: string
}
type Ancestry = {
  ancestor: string
  descendant: string
}
type PublishRequest = {
  ctx: ReleaseContext
  prepared: Prepared
}
type MergeCheck = PublishRequest & { merge: string }
type MergeResult = {
  merged: boolean
  sha: string
}
type PublishedRelease = {
  body: string
  draft: boolean
  prerelease: boolean
}

function git(...args: string[]): Promise<string> {
  return command('git', args)
}

// Adiar não é falha: o CI do commit mais novo da main inicia outra release.
async function postpone(message: string): Promise<void> {
  console.warn(`::notice::${message}`)
  if (env.GITHUB_STEP_SUMMARY) {
    await appendFile(env.GITHUB_STEP_SUMMARY, `${message}\n`)
  }
}

async function mainSha(ctx: ReleaseContext): Promise<string> {
  const ref = await api<GitReference>(`${ctx.root}/git/ref/heads/main`)
  return requireSha(ref.object.sha)
}

async function assertMainProtection(ctx: ReleaseContext): Promise<void> {
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

async function validateHead({ ctx, release, head }: HeadCheck): Promise<void> {
  await git('fetch', 'origin', head)
  const commit = await api<GitCommit>(`${ctx.root}/git/commits/${head}`)
  if (commit.parents.length !== 1 || commit.parents[0]?.sha !== ctx.source) {
    throw new Error(
      'Release commit is not a direct child of the validated source.'
    )
  }
  const changed = await git('diff', '--name-only', ctx.source, head)
  assertReleaseFiles(changed.split('\n'))
  if (await git('diff', '--summary', ctx.source, head)) {
    throw new Error('Release commit must preserve file modes and types.')
  }
  for (const expected of release.files) {
    // A saída do git show já vem aparada pelo comando; normalize só a quebra de linha final.
    if (
      (await git('show', `${head}:${expected.path}`)) !==
      expected.content.trimEnd()
    ) {
      throw new Error(`Unexpected release content in ${expected.path}.`)
    }
  }
}

async function isAncestor({
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

async function closePullRequest({ ctx, pr }: PullRequestTarget): Promise<void> {
  await mutate({
    path: `${ctx.root}/pulls/${pr.number}`,
    method: 'PATCH',
    payload: { state: 'closed' }
  })
  await postpone(`Closed obsolete release pull request #${pr.number}.`)
}

// Fecha PRs de release abertos cuja origem ficou para trás na main. A branch
// permanece para inspeção; um PR de origem mais nova nunca é tocado.
async function closeObsoletePullRequests({
  ctx,
  branch
}: ObsoleteSearch): Promise<void> {
  const pulls = await api<PullRequest[]>(
    `${ctx.root}/pulls?state=open&base=main&per_page=100`
  )
  for (const pr of pulls) {
    if (
      pr.head.ref === branch ||
      !isOpenReleasePullRequest({ pr, repository: ctx.repository })
    ) {
      continue
    }
    const commit = await api<GitCommit>(
      `${ctx.root}/git/commits/${requireSha(pr.head.sha)}`
    )
    const [parent] = commit.parents
    if (
      commit.parents.length === 1 &&
      parent &&
      parent.sha !== ctx.source &&
      (await isAncestor({ ancestor: parent.sha, descendant: ctx.source }))
    ) {
      await closePullRequest({ ctx, pr })
    }
  }
}

async function createBranch({
  ctx,
  release,
  branch
}: BranchRequest): Promise<GitReference> {
  const base = await api<GitCommit>(`${ctx.root}/git/commits/${ctx.source}`)
  const tree = await mutate<{ sha: string }>({
    path: `${ctx.root}/git/trees`,
    method: 'POST',
    payload: {
      base_tree: base.tree.sha,
      tree: release.files.map(file => ({
        path: file.path,
        content: file.content,
        mode: '100644',
        type: 'blob'
      }))
    }
  })
  const identity = { ...BOT, date: ctx.date }
  const commit = await mutate<{ sha: string }>({
    path: `${ctx.root}/git/commits`,
    method: 'POST',
    payload: {
      message: `chore(release): v${release.plan.version}\n\n[skip ci]`,
      tree: tree.sha,
      parents: [ctx.source],
      author: identity,
      committer: identity
    }
  })
  return mutate<GitReference>({
    path: `${ctx.root}/git/refs`,
    method: 'POST',
    payload: { ref: `refs/heads/${branch}`, sha: commit.sha }
  })
}

async function prepare({
  ctx,
  release,
  shouldCreate
}: PrepareOptions): Promise<Prepared | undefined> {
  const branch = `release/v${release.plan.version}-${ctx.source.slice(0, BRANCH_SHA_LENGTH)}`
  const [owner] = ctx.repository.split('/')
  const pulls = await api<PullRequest[]>(
    `${ctx.root}/pulls?state=all&base=main&head=${owner}:${branch}&per_page=100`
  )
  if (pulls.length > 1) throw new Error('Ambiguous release pull requests.')
  const existing = pulls[0]
    ? await api<PullRequest>(`${ctx.root}/pulls/${pulls[0].number}`)
    : undefined
  if (existing?.merged) {
    const head = requireSha(existing.head.sha)
    assertReleasePullRequest({
      pr: existing,
      repository: ctx.repository,
      branch,
      head
    })
    await validateHead({ ctx, release, head })
    return { release, branch, head, pr: existing }
  }
  if (shouldCreate && (await mainSha(ctx)) !== ctx.source) {
    if (
      existing &&
      isOpenReleasePullRequest({ pr: existing, repository: ctx.repository })
    ) {
      await closePullRequest({ ctx, pr: existing })
    }
    await postpone(
      `Main advanced past ${ctx.source}; the release waits for the CI of the newer commit.`
    )
    return undefined
  }
  if (shouldCreate) {
    await assertMainProtection(ctx)
    await closeObsoletePullRequests({ ctx, branch })
  }
  let ref = await optionalApi<GitReference>(
    `${ctx.root}/git/ref/heads/${branch}`
  )
  if (!ref) {
    if (!shouldCreate) throw new Error('Prepared release branch is missing.')
    ref = await createBranch({ ctx, release, branch })
  }
  const head = requireSha(ref.object.sha)
  await validateHead({ ctx, release, head })
  let number = existing?.number
  if (!number) {
    if (!shouldCreate) {
      throw new Error('Prepared release pull request is missing.')
    }
    const created = await mutate<PullRequest>({
      path: `${ctx.root}/pulls`,
      method: 'POST',
      payload: {
        title: `chore(release): v${release.plan.version}`,
        head: branch,
        base: 'main',
        body: `Release prepared from successful CI at ${ctx.source}.\n\n${release.plan.notes}`
      }
    })
    ;({ number } = created)
  }
  const pr = await api<PullRequest>(`${ctx.root}/pulls/${number}`)
  assertReleasePullRequest({ pr, repository: ctx.repository, branch, head })
  return { release, branch, head, pr }
}

async function verifyMerge({
  ctx,
  prepared,
  merge
}: MergeCheck): Promise<void> {
  const commit = await api<GitCommit>(`${ctx.root}/git/commits/${merge}`)
  const head = await api<GitCommit>(`${ctx.root}/git/commits/${prepared.head}`)
  if (
    commit.parents.length !== MERGE_PARENT_COUNT ||
    commit.parents[0]?.sha !== ctx.source ||
    commit.parents[1]?.sha !== prepared.head ||
    commit.tree.sha !== head.tree.sha
  ) {
    throw new Error(
      'Merge differs from the validated release tree; publication stopped.'
    )
  }
  await git('fetch', 'origin', 'main')
  await git('merge-base', '--is-ancestor', merge, 'origin/main')
}

// Devolve o SHA do merge, ou undefined quando a main avançou antes do merge.
async function mergeRelease({
  ctx,
  prepared
}: PublishRequest): Promise<string | undefined> {
  if (prepared.pr.merged) return prepared.pr.merge_commit_sha ?? undefined
  // Os strict checks rejeitam atualização concorrente da base dentro da operação de merge do GitHub.
  await assertMainProtection(ctx)
  if ((await mainSha(ctx)) !== ctx.source) {
    await postpone(
      `Main advanced past ${ctx.source} during release validation; merge skipped. The next release closes pull request #${prepared.pr.number}.`
    )
    return undefined
  }
  const sourceCiUrl = `https://github.com/${ctx.repository}/actions/runs/${requiredEnv('RELEASE_SOURCE_RUN_ID')}`
  await mutate({
    path: `${ctx.root}/check-runs`,
    method: 'POST',
    payload: {
      name: REQUIRED_CHECK,
      head_sha: prepared.head,
      details_url: sourceCiUrl,
      status: 'completed',
      conclusion: 'success',
      output: {
        title: 'Release metadata validated against successful source CI',
        summary: `Source CI passed for ${ctx.source}. Release ${prepared.head} preserves the validated application and changes only the package version and generated changelog. [View source CI](${sourceCiUrl}).`
      }
    }
  })
  const result = await mutate<MergeResult>({
    path: `${ctx.root}/pulls/${prepared.pr.number}/merge`,
    method: 'PUT',
    payload: {
      merge_method: 'merge',
      sha: prepared.head,
      commit_title: `chore(release): v${prepared.release.plan.version}`
    }
  })
  if (!result.merged) throw new Error('Release PR was not merged.')
  return result.sha
}

async function cleanupBranch({ ctx, prepared }: PublishRequest): Promise<void> {
  try {
    const branchRef = `refs/heads/${prepared.branch}`
    const remaining = await optionalApi<GitReference>(
      `${ctx.root}/git/ref/heads/${prepared.branch}`
    )
    if (!remaining) return
    if (remaining.object.sha !== prepared.head) {
      throw new Error('Release branch advanced; refusing cleanup.')
    }
    // O lease confere o SHA esperado de forma atômica, inclusive atualizações após a leitura.
    await command('git', [
      '-c',
      'credential.helper=',
      '-c',
      'credential.helper=!gh auth git-credential',
      'push',
      `--force-with-lease=${branchRef}:${prepared.head}`,
      `https://github.com/${ctx.repository}.git`,
      `:${branchRef}`
    ])
  } catch {
    console.warn(
      '::warning::Release published; branch cleanup could not complete. The branch was preserved if it still exists.'
    )
  }
}

async function publish({ ctx, prepared }: PublishRequest): Promise<void> {
  if (requiredEnv('RELEASE_HEAD') !== prepared.head) {
    throw new Error('Validated release SHA changed.')
  }
  const merge = await mergeRelease({ ctx, prepared })
  if (merge === undefined && !prepared.pr.merged) return
  if (!merge) throw new Error('Missing release merge SHA.')
  requireSha(merge)
  await verifyMerge({ ctx, prepared, merge })
  const { plan } = prepared.release
  const tagPath = `${ctx.root}/git/ref/tags/${plan.tag}`
  let tagRef = await optionalApi<GitReference>(tagPath)
  if (!tagRef) {
    const tag = await mutate<{ sha: string }>({
      path: `${ctx.root}/git/tags`,
      method: 'POST',
      payload: {
        tag: plan.tag,
        message: `Release ${plan.tag}`,
        object: merge,
        type: 'commit',
        tagger: { ...BOT, date: ctx.date }
      }
    })
    tagRef = await mutate<GitReference>({
      path: `${ctx.root}/git/refs`,
      method: 'POST',
      payload: { ref: `refs/tags/${plan.tag}`, sha: tag.sha }
    })
  }
  if (tagRef.object.type !== 'tag') {
    throw new Error('Release tag must be annotated.')
  }
  const tag = await api<GitReference>(
    `${ctx.root}/git/tags/${tagRef.object.sha}`
  )
  if (tag.object.sha !== merge || tag.object.type !== 'commit') {
    throw new Error('Existing tag points to another commit.')
  }
  const published = await optionalApi<PublishedRelease>(
    `${ctx.root}/releases/tags/${plan.tag}`
  )
  if (
    published &&
    (published.draft ||
      published.prerelease ||
      published.body.trim() !== plan.notes.trim())
  ) {
    throw new Error('Existing release does not match the generated notes.')
  }
  if (!published) {
    await mutate({
      path: `${ctx.root}/releases`,
      method: 'POST',
      payload: {
        tag_name: plan.tag,
        name: plan.tag,
        body: plan.notes,
        draft: false,
        prerelease: false
      }
    })
  }
  await appendOutput({ tag: plan.tag, version: plan.version })
  await cleanupBranch({ ctx, prepared })
}

const mode = requiredEnv('RELEASE_MODE')
if (!['prepare', 'publish'].includes(mode)) {
  throw new Error('Invalid release mode.')
}
const ctx = await readContext()
const expected = await readSourcePlan(ctx)
if (!expected) throw new Error('The validated source has no release to plan.')
const release = assertPlanArtifact({
  artifact: await readPlanArtifact(requiredEnv('RELEASE_PLAN_FILE')),
  ctx,
  expected
})
const prepared = await prepare({
  ctx,
  release,
  shouldCreate: mode === 'prepare'
})
if (mode === 'publish' && prepared) {
  await publish({ ctx, prepared })
}
if (mode === 'prepare') {
  await appendOutput(
    prepared
      ? { publish: 'true', head: prepared.head, source: ctx.source }
      : { publish: 'false' }
  )
}
