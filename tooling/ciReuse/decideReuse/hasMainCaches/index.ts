import { createHash } from 'node:crypto'

import type { Context, Runner } from '../types.ts'

const MAIN_REF = 'refs/heads/main'

const VALIDATION_CACHE_PREFIX = 'ci-validation-v2-'

const DEPENDENCY_CACHE_PREFIX = 'vite-plus-'

const PAGE_SIZE = 100

type ActionsCache = { key: string; ref: string }

type ActionsCaches = { actions_caches: ActionsCache[] }

type RuntimeEngine = { version?: unknown }

type DevEngines = { runtime?: RuntimeEngine }

type Manifest = { devEngines?: DevEngines; packageManager?: unknown }

type CacheOptions = Context & { runner: Runner }

type CacheLookup = Context & { key: string; isPrefix: boolean }

function digest(value: Uint8Array): Buffer {
  return createHash('sha256').update(value).digest()
}

// The key filter of the API compares by prefix; the exact key requires checking equality.
async function hasMainCache({
  repository,
  key,
  isPrefix,
  ports
}: CacheLookup): Promise<boolean> {
  const caches = await ports.api<ActionsCaches>(
    `repos/${repository}/actions/caches?ref=${encodeURIComponent(MAIN_REF)}&key=${encodeURIComponent(key)}&per_page=${PAGE_SIZE}`
  )
  return caches.actions_caches.some(
    cache =>
      cache.ref === MAIN_REF &&
      (isPrefix ? cache.key.startsWith(key) : cache.key === key)
  )
}

export async function hasMainCaches({
  sha,
  runner,
  ...context
}: CacheOptions): Promise<boolean> {
  const { ports } = context
  // Same value of hashFiles('bun.lock') in the workflow keys.
  const lock = digest(digest(await ports.readBlob(`${sha}:bun.lock`)))
  const hash = lock.toString('hex')
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The read fields are validated below.
  const manifest = JSON.parse(
    await ports.git(['show', `${sha}:package.json`])
  ) as Manifest
  const node = manifest.devEngines?.runtime?.version
  const packageManager =
    typeof manifest.packageManager === 'string' ? manifest.packageManager : ''
  const bun = /^bun@(?<version>[^+]+)/u.exec(packageManager)?.groups?.version
  if (typeof node !== 'string' || !bun) {
    throw new Error('Node or Bun versions missing from package.json.')
  }
  // Format documented in the setup-vp README, with the Node architecture:
  // vite-plus-{OS}-{arch}-{pm}-{lockfile-hash}.
  const dependencies = `${DEPENDENCY_CACHE_PREFIX}${runner.os}-${runner.nodeArch}-bun-${hash}`
  const validation = `${VALIDATION_CACHE_PREFIX}${runner.os}-${runner.arch}-node-${node}-bun-${bun}-${hash}-`
  const lookups = [
    { ...context, sha, key: dependencies, isPrefix: false },
    { ...context, sha, key: validation, isPrefix: true }
  ]
  const results = await Promise.all(lookups.map(lookup => hasMainCache(lookup)))
  return results.every(Boolean)
}
