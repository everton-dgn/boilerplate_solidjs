import { BOT } from './constants.ts'
import { postpone, type ReleaseContext } from './context.ts'
import {
  api,
  assertReleaseFiles,
  assertReleasePullRequest,
  isOpenReleasePullRequest,
  mutate,
  optionalApi,
  requireSha,
  type PullRequest
} from './github.ts'
import type { ValidatedRelease } from './plan-artifact.ts'
import { assertMainProtection, git, isAncestor, mainSha } from './repository.ts'
import type { GitCommit, GitReference, Prepared } from './types.ts'

const BRANCH_SHA_LENGTH = 12

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

export async function prepareRelease({
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
