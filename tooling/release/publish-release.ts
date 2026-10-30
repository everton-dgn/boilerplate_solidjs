import { BOT, REQUIRED_CHECK } from './constants.ts'
import { postpone, requiredEnv } from './context.ts'
import { api, git, mutate, optionalApi, requireSha } from './github.ts'
import { assertMainProtection, mainSha } from './repository.ts'
import type {
  GitCommit,
  GitReference,
  Prepared,
  ReleaseContext
} from './types.ts'

const MERGE_PARENT_COUNT = 2

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
    await git(
      '-c',
      'credential.helper=',
      '-c',
      'credential.helper=!gh auth git-credential',
      'push',
      `--force-with-lease=${branchRef}:${prepared.head}`,
      `https://github.com/${ctx.repository}.git`,
      `:${branchRef}`
    )
  } catch {
    console.warn(
      '::warning::Release published; branch cleanup could not complete. The branch was preserved if it still exists.'
    )
  }
}

export async function publishRelease({
  ctx,
  prepared
}: PublishRequest): Promise<void> {
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
  await cleanupBranch({ ctx, prepared })
}
