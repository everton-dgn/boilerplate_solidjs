import { createHash } from 'node:crypto'

import type { Context, Runner } from '../types.ts'

const MAIN_REF = 'refs/heads/main'

const VALIDATION_CACHE_PREFIX = 'ci-validation-v2-'

const PAGE_SIZE = 100

type ActionsCache = { key: string; ref: string }

type ActionsCaches = { actions_caches: ActionsCache[] }

type RuntimeEngine = { version?: unknown }

type DevEngines = { runtime?: RuntimeEngine }

type Manifest = { devEngines?: DevEngines; packageManager?: unknown }

type CacheOptions = Context & { runner: Runner }

function digest(value: Uint8Array): Buffer {
  return createHash('sha256').update(value).digest()
}

// Só a chave de validação, definida no ci.yml, é consultada: a de pacotes segue
// o formato interno do setup-vp, que pode mudar sem aviso.
export async function hasMainCaches({
  repository,
  sha,
  runner,
  ports
}: CacheOptions): Promise<boolean> {
  // Mesmo valor de hashFiles('bun.lock') nas chaves do workflow.
  const lock = digest(digest(await ports.readBlob(`${sha}:bun.lock`)))
  const hash = lock.toString('hex')
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Os campos lidos são validados abaixo.
  const manifest = JSON.parse(
    await ports.git(['show', `${sha}:package.json`])
  ) as Manifest
  const node = manifest.devEngines?.runtime?.version
  const packageManager =
    typeof manifest.packageManager === 'string' ? manifest.packageManager : ''
  const bun = /^bun@(?<version>[^+]+)/u.exec(packageManager)?.groups?.version
  if (typeof node !== 'string' || !bun) {
    throw new Error('Versões de Node ou Bun ausentes no package.json.')
  }
  const prefix = `${VALIDATION_CACHE_PREFIX}${runner.os}-${runner.arch}-node-${node}-bun-${bun}-${hash}-`
  const caches = await ports.api<ActionsCaches>(
    `repos/${repository}/actions/caches?ref=${encodeURIComponent(MAIN_REF)}&key=${encodeURIComponent(prefix)}&per_page=${PAGE_SIZE}`
  )
  return caches.actions_caches.some(
    cache => cache.ref === MAIN_REF && cache.key.startsWith(prefix)
  )
}
