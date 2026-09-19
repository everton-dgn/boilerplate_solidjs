import { appendFile } from 'node:fs/promises'
import { env } from 'node:process'

import { format } from 'vite-plus/fmt'

import { fmt } from '../fmt.ts'
import {
  api,
  assertReleaseFiles,
  assertReleasePullRequest,
  assertSourceRun,
  command,
  optionalApi,
  requireSha,
  type PullRequest
} from './github.ts'
import {
  parseVersion,
  planRelease,
  type Commit,
  type ReleasePlan
} from './versioning.ts'

const LOG_FIELD_COUNT = 2
const ISO_DATE_LENGTH = 10
const JSON_INDENT = 2
const BRANCH_SHA_LENGTH = 12
const MERGE_PARENT_COUNT = 2
const GITHUB_ACTIONS_APP_ID = 15_368
const REQUIRED_CHECK = 'CI required'

type GitCommit = {
  sha: string
  tree: { sha: string }
  parents: { sha: string }[]
  author: { date: string }
}
type GitReference = {
  object: { sha: string; type: string }
}
type Context = {
  repository: string
  source: string
  root: string
  date: string
}
type Prepared = {
  plan: ReleasePlan
  branch: string
  head: string
  pr: PullRequest
}

function required(name: string): string {
  const value = env[name]
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}

async function git(...args: string[]): Promise<string> {
  return command('git', args)
}

async function output(values: Record<string, string>): Promise<void> {
  const file = required('GITHUB_OUTPUT')
  await appendFile(
    file,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}\n`)
      .join('')
  )
}

async function context(): Promise<Context> {
  const repository = required('GITHUB_REPOSITORY')
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repository)) {
    throw new Error('Invalid repository.')
  }
  const runId = required('RELEASE_SOURCE_RUN_ID')
  if (!/^\d+$/u.test(runId)) throw new Error('Invalid source run ID.')
  const root = `repos/${repository}`
  const run = await api<Parameters<typeof assertSourceRun>[0]>(
    `${root}/actions/runs/${runId}`
  )
  const source = assertSourceRun(run, repository)
  await git('fetch', 'origin', 'main', '--tags')
  await git('merge-base', '--is-ancestor', source, 'origin/main')
  const trusted = await git('rev-parse', 'HEAD')
  await git('merge-base', '--is-ancestor', trusted, 'origin/main')
  const date = await git('show', '-s', '--format=%cI', source)
  return { repository, root, source, date }
}

async function mainSha(ctx: Context): Promise<string> {
  const ref = await api<GitReference>(`${ctx.root}/git/ref/heads/main`)
  return requireSha(ref.object.sha)
}

async function createPlan(ctx: Context): Promise<ReleasePlan | undefined> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- O manifest é lido do commit validado pela CI; a versão é validada pelo planRelease.
  const manifest = JSON.parse(
    await git('show', `${ctx.source}:package.json`)
  ) as { version: string }
  const tags = await git(
    'tag',
    '--merged',
    ctx.source,
    '--sort=-version:refname'
  )
  const baselineTag = tags
    .split('\n')
    .find(tag => /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(tag))
  const range = baselineTag ? `${baselineTag}..${ctx.source}` : ctx.source
  const log = await git('log', '--no-merges', '--format=%H%x00%B%x00', range)
  const fields = log.split('\0')
  const commits: Commit[] = []
  for (let index = 0; index + 1 < fields.length; index += LOG_FIELD_COUNT) {
    commits.push({
      sha: requireSha((fields[index] ?? '').trim()),
      message: fields[index + 1] ?? ''
    })
  }
  const plan = planRelease({
    currentVersion: manifest.version,
    baselineTag,
    commits,
    changelog: await git('show', `${ctx.source}:CHANGELOG.md`),
    date: ctx.date.slice(0, ISO_DATE_LENGTH)
  })
  if (!plan) return undefined
  const formatted = await format('CHANGELOG.md', plan.changelog, fmt)
  if (formatted.errors.length > 0) {
    throw new Error('Cannot format release notes.')
  }
  const heading = `## ${plan.version} - ${ctx.date.slice(0, ISO_DATE_LENGTH)}`
  const section = formatted.code.slice(
    formatted.code.indexOf(heading) + heading.length
  )
  const next = section.search(/^## /mu)
  return {
    ...plan,
    changelog: formatted.code,
    notes: section.slice(0, next < 0 ? undefined : next).trim()
  }
}

async function expectedFiles(
  ctx: Context,
  plan: ReleasePlan
): Promise<{ path: string; content: string }[]> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- O manifest é lido do commit validado pela CI; a versão é validada pelo planRelease.
  const manifest = JSON.parse(
    await git('show', `${ctx.source}:package.json`)
  ) as Record<string, unknown>
  const files = [
    {
      path: 'package.json',
      content: `${JSON.stringify({ ...manifest, version: plan.version }, null, JSON_INDENT)}\n`
    },
    { path: 'CHANGELOG.md', content: plan.changelog }
  ]
  for (const file of files) {
    const formatted = await format(file.path, file.content, fmt)
    if (formatted.errors.length > 0) {
      throw new Error(`Cannot format ${file.path}.`)
    }
    file.content = formatted.code
  }
  return files
}

async function validateHead(
  ctx: Context,
  plan: ReleasePlan,
  head: string
): Promise<void> {
  await git('fetch', 'origin', head)
  const commit = await api<GitCommit>(`${ctx.root}/git/commits/${head}`)
  if (commit.parents.length !== 1 || commit.parents[0]?.sha !== ctx.source) {
    throw new Error(
      'Release commit is not a direct child of the validated source.'
    )
  }
  const changed = await git('diff', '--name-only', ctx.source, head)
  const files = changed.split('\n')
  assertReleaseFiles(files)
  for (const expected of await expectedFiles(ctx, plan)) {
    // A saída do git show já vem aparada pelo comando; normalize só a quebra de linha final.
    if (
      (await git('show', `${head}:${expected.path}`)) !==
      expected.content.trimEnd()
    ) {
      throw new Error(`Unexpected release content in ${expected.path}.`)
    }
  }
}

async function prepare(
  ctx: Context,
  plan: ReleasePlan,
  create: boolean
): Promise<Prepared> {
  const branch = `release/v${plan.version}-${ctx.source.slice(0, BRANCH_SHA_LENGTH)}`
  const [owner] = ctx.repository.split('/')
  const pulls = await api<PullRequest[]>(
    `${ctx.root}/pulls?state=all&base=main&head=${owner}:${branch}&per_page=100`
  )
  if (pulls.length > 1) throw new Error('Ambiguous release pull requests.')
  let ref = await optionalApi<GitReference>(
    `${ctx.root}/git/ref/heads/${branch}`
  )
  if (!ref && pulls[0]) {
    const pr = await api<PullRequest>(`${ctx.root}/pulls/${pulls[0].number}`)
    if (pr.merged) {
      const head = requireSha(pr.head.sha)
      assertReleasePullRequest(pr, ctx.repository, branch, head)
      await validateHead(ctx, plan, head)
      return { plan, branch, head, pr }
    }
  }
  if (!ref) {
    if (!create) throw new Error('Prepared release branch is missing.')
    if ((await mainSha(ctx)) !== ctx.source) {
      throw new Error('Main advanced; wait for its own successful CI.')
    }
    const base = await api<GitCommit>(`${ctx.root}/git/commits/${ctx.source}`)
    const files = await expectedFiles(ctx, plan)
    const tree = await api<{ sha: string }>(`${ctx.root}/git/trees`, 'POST', {
      base_tree: base.tree.sha,
      tree: files.map(file => ({
        path: file.path,
        content: file.content,
        mode: '100644',
        type: 'blob'
      }))
    })
    const identity = {
      name: 'github-actions[bot]',
      email: '41898282+github-actions[bot]@users.noreply.github.com',
      date: ctx.date
    }
    const commit = await api<{ sha: string }>(
      `${ctx.root}/git/commits`,
      'POST',
      {
        message: `chore(release): v${plan.version}\n\n[skip ci]`,
        tree: tree.sha,
        parents: [ctx.source],
        author: identity,
        committer: identity
      }
    )
    ref = await api<GitReference>(`${ctx.root}/git/refs`, 'POST', {
      ref: `refs/heads/${branch}`,
      sha: commit.sha
    })
  }
  const head = requireSha(ref.object.sha)
  await validateHead(ctx, plan, head)
  let number = pulls[0]?.number
  if (!number) {
    if (!create) throw new Error('Prepared release pull request is missing.')
    const pr = await api<PullRequest>(`${ctx.root}/pulls`, 'POST', {
      title: `chore(release): v${plan.version}`,
      head: branch,
      base: 'main',
      body: `Release prepared from successful CI at ${ctx.source}.\n\n${plan.notes}`
    })
    ;({ number } = pr)
  }
  const pr = await api<PullRequest>(`${ctx.root}/pulls/${number}`)
  assertReleasePullRequest(pr, ctx.repository, branch, head)
  return { plan, branch, head, pr }
}

async function verifyMerge(
  ctx: Context,
  prepared: Prepared,
  sha: string
): Promise<void> {
  const merge = await api<GitCommit>(`${ctx.root}/git/commits/${sha}`)
  const head = await api<GitCommit>(`${ctx.root}/git/commits/${prepared.head}`)
  if (
    merge.parents.length !== MERGE_PARENT_COUNT ||
    merge.parents[0]?.sha !== ctx.source ||
    merge.parents[1]?.sha !== prepared.head ||
    merge.tree.sha !== head.tree.sha
  ) {
    throw new Error(
      'Merge differs from the validated release tree; publication stopped.'
    )
  }
  await git('fetch', 'origin', 'main')
  await git('merge-base', '--is-ancestor', sha, 'origin/main')
}

async function publish(ctx: Context, prepared: Prepared): Promise<void> {
  if (required('RELEASE_HEAD') !== prepared.head) {
    throw new Error('Validated release SHA changed.')
  }
  let merge = prepared.pr.merge_commit_sha
  if (!prepared.pr.merged) {
    // Os strict checks rejeitam atualização concorrente da base dentro da operação de merge do GitHub.
    const rules = await api<
      {
        type: string
        parameters?: {
          strict_required_status_checks_policy?: boolean
          required_status_checks?: { context: string; integration_id: number }[]
        }
      }[]
    >(`${ctx.root}/rules/branches/main?per_page=100`)
    if (
      !rules.some(rule => rule.type === 'pull_request') ||
      !rules.some(
        rule =>
          rule.type === 'required_status_checks' &&
          rule.parameters?.strict_required_status_checks_policy === true &&
          rule.parameters.required_status_checks?.some(
            check =>
              check.context === REQUIRED_CHECK &&
              check.integration_id === GITHUB_ACTIONS_APP_ID
          )
      )
    ) {
      throw new Error(
        'Main requires strict CI protection before release merge.'
      )
    }
    if ((await mainSha(ctx)) !== ctx.source) {
      throw new Error(
        'Main advanced during release validation; refusing merge.'
      )
    }
    // A CI reutilizável pertence à execução chamadora; vincule o sucesso dela ao SHA testado.
    // Este modo é invocado só depois que o job validate passa.
    await api(`${ctx.root}/check-runs`, 'POST', {
      name: REQUIRED_CHECK,
      head_sha: prepared.head,
      status: 'completed',
      conclusion: 'success',
      output: {
        title: 'Release commit validated',
        summary: `Reusable CI passed for ${prepared.head}, based on ${ctx.source}.`
      }
    })
    const result = await api<{ merged: boolean; sha: string }>(
      `${ctx.root}/pulls/${prepared.pr.number}/merge`,
      'PUT',
      {
        merge_method: 'merge',
        sha: prepared.head,
        commit_title: `chore(release): v${prepared.plan.version}`
      }
    )
    if (!result.merged) throw new Error('Release PR was not merged.')
    merge = result.sha
  }
  if (!merge) throw new Error('Missing release merge SHA.')
  requireSha(merge)
  await verifyMerge(ctx, prepared, merge)
  const tagPath = `${ctx.root}/git/ref/tags/${prepared.plan.tag}`
  let tagRef = await optionalApi<GitReference>(tagPath)
  if (!tagRef) {
    const tag = await api<{ sha: string }>(`${ctx.root}/git/tags`, 'POST', {
      tag: prepared.plan.tag,
      message: `Release ${prepared.plan.tag}`,
      object: merge,
      type: 'commit',
      tagger: {
        name: 'github-actions[bot]',
        email: '41898282+github-actions[bot]@users.noreply.github.com',
        date: ctx.date
      }
    })
    tagRef = await api<GitReference>(`${ctx.root}/git/refs`, 'POST', {
      ref: `refs/tags/${prepared.plan.tag}`,
      sha: tag.sha
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
  const release = await optionalApi<{
    body: string
    draft: boolean
    prerelease: boolean
  }>(`${ctx.root}/releases/tags/${prepared.plan.tag}`)
  if (release) {
    if (
      release.draft ||
      release.prerelease ||
      release.body.trim() !== prepared.plan.notes.trim()
    ) {
      throw new Error('Existing release does not match the generated notes.')
    }
  } else {
    await api(`${ctx.root}/releases`, 'POST', {
      tag_name: prepared.plan.tag,
      name: prepared.plan.tag,
      body: prepared.plan.notes,
      draft: false,
      prerelease: false
    })
  }
  await output({ tag: prepared.plan.tag, version: prepared.plan.version })
  try {
    const branchRef = `refs/heads/${prepared.branch}`
    const remaining = await optionalApi<GitReference>(
      `${ctx.root}/git/ref/heads/${prepared.branch}`
    )
    if (remaining) {
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
    }
  } catch {
    console.warn(
      '::warning::Release published; branch cleanup could not complete. The branch was preserved if it still exists.'
    )
  }
}

const mode = required('RELEASE_MODE')
if (!['prepare', 'publish'].includes(mode)) {
  throw new Error('Invalid release mode.')
}
const ctx = await context()
const plan = await createPlan(ctx)
if (plan) {
  parseVersion(plan.version)
  const prepared = await prepare(ctx, plan, mode === 'prepare')
  if (mode === 'publish') {
    await publish(ctx, prepared)
  } else {
    const values = { publish: 'true', head: prepared.head, source: ctx.source }
    await output(values)
  }
} else {
  await output({ publish: 'false' })
}
