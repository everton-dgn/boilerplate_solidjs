import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const MAX_OUTPUT_BYTES = 16_777_216
const RELEASE_FILE_COUNT = 2
type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

export async function command(file: string, args: string[]): Promise<string> {
  const result = await execute(file, args, { maxBuffer: MAX_OUTPUT_BYTES })
  return result.stdout.trim()
}

export async function api<T>(
  path: string,
  method = 'GET',
  payload?: Json
): Promise<T> {
  const args = ['api', path, '--method', method]
  if (payload !== undefined) args.push('--input', '-')
  // oxlint-disable-next-line promise/avoid-new -- Bridge execFile stdin and its completion callback.
  const output = await new Promise<string>((resolve, reject) => {
    const child = execFile(
      'gh',
      args,
      { maxBuffer: MAX_OUTPUT_BYTES },
      (error, stdout) => {
        // API errors can contain request data; do not echo payloads or tokens.
        if (error) {
          reject(
            new Error(
              `GitHub API ${method} ${path} failed. Check workflow permissions and repository rules.`
            )
          )
        } else resolve(stdout)
      }
    )
    child.stdin?.end(
      payload === undefined ? undefined : JSON.stringify(payload)
    )
  })
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Callers validate the identities and state used for mutations.
  return JSON.parse(output) as T
}

export async function optionalApi<T>(path: string): Promise<T | undefined> {
  // Inspect HTTP status explicitly so authentication/network failures are never treated as absence.
  // oxlint-disable-next-line promise/avoid-new -- HTTP 404 is carried in stdout even when execFile fails.
  const output = await new Promise<string>((resolve, reject) => {
    execFile(
      'gh',
      ['api', path, '--include'],
      { maxBuffer: MAX_OUTPUT_BYTES },
      (error, stdout) => {
        if (!error) resolve(stdout)
        else if (/^HTTP\/\S+ 404\b/mu.test(stdout)) resolve('')
        else {
          reject(
            new Error(`Cannot read ${path}: ${error.code ?? 'unknown error'}`)
          )
        }
      }
    )
  })
  if (!output) return undefined
  const separator = output.search(/\r?\n\r?\n/u)
  if (separator < 0) throw new Error('Missing GitHub HTTP response headers.')
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Callers validate mutation-relevant fields.
  return JSON.parse(output.slice(separator).trim()) as T
}

export function requireSha(value: string): string {
  if (!/^[a-f\d]{40}$/u.test(value)) {
    throw new Error('Expected an exact Git commit SHA.')
  }
  return value
}

export function assertSourceRun(
  run: {
    conclusion: string
    event: string
    head_branch: string
    head_sha: string
    path: string
    head_repository: { full_name: string }
  },
  repository: string
): string {
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

export interface PullRequest {
  number: number
  state: string
  merged: boolean
  merge_commit_sha: string | null
  user: { login: string }
  head: { sha: string; ref: string; repo: { full_name: string } }
  base: { ref: string; repo: { full_name: string } }
}

export function assertReleasePullRequest(
  pr: PullRequest,
  repository: string,
  branch: string,
  head: string
): void {
  if (
    pr.user.login !== 'github-actions[bot]' ||
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
