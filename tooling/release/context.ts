import { appendFile } from 'node:fs/promises'
import { env } from 'node:process'

import { command, readSourceRun, requireSha } from './github.ts'
import { planRelease, type Commit, type ReleasePlan } from './versioning.ts'

const LOG_FIELD_COUNT = 2
const ISO_DATE_LENGTH = 10

function git(...args: string[]): Promise<string> {
  return command('git', args)
}

export type ReleaseContext = {
  repository: string
  source: string
  root: string
  date: string
  manifest: Record<string, unknown>
}

export function requiredEnv(name: string): string {
  const value = env[name]
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}

export async function appendOutput(
  values: Record<string, string>
): Promise<void> {
  await appendFile(
    requiredEnv('GITHUB_OUTPUT'),
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}\n`)
      .join('')
  )
}

export function releaseDay(ctx: ReleaseContext): string {
  return ctx.date.slice(0, ISO_DATE_LENGTH)
}

export async function readContext(): Promise<ReleaseContext> {
  const repository = requiredEnv('GITHUB_REPOSITORY')
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repository)) {
    throw new Error('Invalid repository.')
  }
  const runId = requiredEnv('RELEASE_SOURCE_RUN_ID')
  if (!/^\d+$/u.test(runId)) throw new Error('Invalid source run ID.')
  const source = await readSourceRun({ repository, runId })
  await git('fetch', 'origin', 'main', '--tags')
  await git('merge-base', '--is-ancestor', source, 'origin/main')
  const trusted = await git('rev-parse', 'HEAD')
  await git('merge-base', '--is-ancestor', trusted, 'origin/main')
  const date = await git('show', '-s', '--format=%cI', source)
  const rawManifest = await git('show', `${source}:package.json`)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- O manifest é lido do commit validado pela CI; a versão é validada no readSourcePlan.
  const manifest = JSON.parse(rawManifest) as Record<string, unknown>
  return { repository, root: `repos/${repository}`, source, date, manifest }
}

// Plano sem formatação, calculado só com Git e código nativo. O job com escrita
// o recalcula para conferir o artifact produzido pelo job de leitura.
export async function readSourcePlan(
  ctx: ReleaseContext
): Promise<ReleasePlan | undefined> {
  const { version } = ctx.manifest
  if (typeof version !== 'string') {
    throw new TypeError('Invalid package.json version.')
  }
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
  return planRelease({
    currentVersion: version,
    baselineTag,
    commits,
    changelog: await git('show', `${ctx.source}:CHANGELOG.md`),
    date: releaseDay(ctx)
  })
}
