import { createHash } from 'node:crypto'

import type { Context, Runner } from '../types.ts'

const MAIN_REF = 'refs/heads/main'

const DEPENDENCY_CACHE_PREFIX = 'vite-plus-'

const PAGE_SIZE = 100

type ActionsCache = { key: string; ref: string }

type ActionsCaches = { actions_caches: ActionsCache[] }

type CacheOptions = Context & { runner: Runner }

type CacheLookup = Context & { key: string; isPrefix: boolean }

function digest(value: Uint8Array): Buffer {
  return createHash('sha256').update(value).digest()
}

// O filtro key da API compara por prefixo; a chave exata exige conferir a igualdade.
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
  // Mesmo valor de hashFiles('bun.lock') nas chaves do workflow.
  const lock = digest(digest(await ports.readBlob(`${sha}:bun.lock`)))
  const hash = lock.toString('hex')
  // Formato documentado no README do setup-vp, com a arquitetura do Node:
  // vite-plus-{OS}-{arch}-{pm}-{lockfile-hash}.
  const key = `${DEPENDENCY_CACHE_PREFIX}${runner.os}-${runner.nodeArch}-bun-${hash}`
  return hasMainCache({ ...context, sha, key, isPrefix: false })
}
