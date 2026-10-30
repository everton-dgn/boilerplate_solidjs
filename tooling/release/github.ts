import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { BOT } from './constants.ts'
import type { PullRequest } from './types.ts'

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type Mutation = {
  path: string
  method: 'POST' | 'PUT' | 'PATCH'
  payload: Json
}
type ApiRequest = {
  path: string
  method: string
  payload?: Json
  allowMissing?: boolean
}
type SourceRun = {
  conclusion: string
  event: string
  head_branch: string
  head_sha: string
  path: string
  head_repository: { full_name: string }
}
type SourceRunCheck = {
  run: SourceRun
  repository: string
}
type SourceRunRequest = {
  repository: string
  runId: string
}
type OpenPullRequestCheck = {
  pr: PullRequest
  repository: string
}
type ReleasePullRequestCheck = OpenPullRequestCheck & {
  branch: string
  head: string
}

const execute = promisify(execFile)
const MAX_OUTPUT_BYTES = 16_777_216
const RELEASE_FILE_COUNT = 2

// Branches de release criadas pela automação: release/vX.Y.Z-<12 hex do SHA>.
function isReleaseBranch(ref: string): boolean {
  return /^release\/v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-[a-f\d]{12}$/u.test(
    ref
  )
}

async function request<T>({
  path,
  method,
  payload,
  allowMissing = false
}: ApiRequest): Promise<T> {
  const args = ['api', path, '--method', method, '--include']
  if (payload !== undefined) args.push('--input', '-')
  // oxlint-disable-next-line promise/avoid-new -- Faz a ponte entre o stdin do execFile e o callback de conclusão.
  const output = await new Promise<string>((resolve, reject) => {
    const child = execFile(
      'gh',
      args,
      { maxBuffer: MAX_OUTPUT_BYTES },
      (error, stdout) => {
        if (!error) {
          resolve(stdout)
          return
        }
        // O status HTTP vem no stdout mesmo quando o gh falha; só o 404 esperado
        // vira ausência, nunca uma falha de autenticação ou de rede.
        if (allowMissing && /^HTTP\/\S+ 404\b/mu.test(stdout)) {
          resolve('')
          return
        }
        // Erros da API podem conter dados da requisição; não ecoe payloads nem tokens.
        reject(
          new Error(
            `GitHub API ${method} ${path} failed. Check workflow permissions and repository rules.`
          )
        )
      }
    )
    child.stdin?.end(
      payload === undefined ? undefined : JSON.stringify(payload)
    )
  })
  const separator = output.search(/\r?\n\r?\n/u)
  if (output && separator < 0) {
    throw new Error('Missing GitHub HTTP response headers.')
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Quem chama valida os campos usados; só optionalApi recebe a ausência.
  return (output ? JSON.parse(output.slice(separator)) : undefined) as T
}

export async function command(file: string, args: string[]): Promise<string> {
  const result = await execute(file, args, { maxBuffer: MAX_OUTPUT_BYTES })
  return result.stdout.trim()
}

// O checkout não guarda o token (persist-credentials: false). Fetch e push se
// autenticam pelo helper do gh com o GH_TOKEN do passo, o que vale também para
// repositório privado.
export function git(...args: string[]): Promise<string> {
  return command('git', [
    '-c',
    'credential.helper=',
    '-c',
    'credential.helper=!gh auth git-credential',
    ...args
  ])
}

export function api<T>(path: string): Promise<T> {
  return request<T>({ path, method: 'GET' })
}

export function mutate<T>(mutation: Mutation): Promise<T> {
  return request<T>(mutation)
}

export function optionalApi<T>(path: string): Promise<T | undefined> {
  return request<T | undefined>({ path, method: 'GET', allowMissing: true })
}

export function requireSha(value: string): string {
  if (!/^[a-f\d]{40}$/u.test(value)) {
    throw new Error('Expected an exact Git commit SHA.')
  }
  return value
}

export function assertSourceRun({ run, repository }: SourceRunCheck): string {
  if (
    run.conclusion !== 'success' ||
    run.event !== 'push' ||
    run.head_branch !== 'main' ||
    run.path !== '.github/workflows/ci.yml' ||
    run.head_repository.full_name !== repository
  ) {
    throw new Error(
      'Release requires successful push CI on main in this repository.'
    )
  }
  return requireSha(run.head_sha)
}

export async function readSourceRun({
  repository,
  runId
}: SourceRunRequest): Promise<string> {
  const run = await api<SourceRun>(`repos/${repository}/actions/runs/${runId}`)
  return assertSourceRun({ run, repository })
}

export function isOpenReleasePullRequest({
  pr,
  repository
}: OpenPullRequestCheck): boolean {
  return (
    pr.user.login === BOT.name &&
    pr.state === 'open' &&
    !pr.merged &&
    isReleaseBranch(pr.head.ref) &&
    pr.head.repo.full_name === repository &&
    pr.base.ref === 'main' &&
    pr.base.repo.full_name === repository
  )
}

export function assertReleasePullRequest({
  pr,
  repository,
  branch,
  head
}: ReleasePullRequestCheck): void {
  if (
    pr.user.login !== BOT.name ||
    pr.head.sha !== head ||
    pr.head.ref !== branch ||
    pr.head.repo.full_name !== repository ||
    pr.base.ref !== 'main' ||
    pr.base.repo.full_name !== repository ||
    (pr.state !== 'open' && !pr.merged)
  ) {
    throw new Error('Release pull request identity or state changed.')
  }
}

export function assertReleaseFiles(files: string[]): void {
  if (
    files.length !== RELEASE_FILE_COUNT ||
    !files.includes('package.json') ||
    !files.includes('CHANGELOG.md')
  ) {
    throw new Error(
      'Release commit must change only package.json and CHANGELOG.md.'
    )
  }
}
