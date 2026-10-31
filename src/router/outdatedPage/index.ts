import { useBeforeLeave } from '@solidjs/router'
import { isServer } from '@solidjs/web'

import { delocalizePathname } from '@/i18n/urls/index.ts'

const RELOAD_STORAGE_KEY = 'outdated-page-reload'
// Uma falha que volta logo depois da recarga indica um build novo também
// quebrado. A janela corta o laço sem impedir a recuperação de outro deploy.
const RELOAD_WINDOW_MS = 30_000

// O estado só muda no navegador: os detectores rodam a partir do entry-client.
const chunkFailures = new WeakSet<object>()
let isOutdated = false

function isOffline(): boolean {
  return !globalThis.navigator.onLine
}

function hasRecentReload(now: number): boolean {
  const last = Number(globalThis.sessionStorage.getItem(RELOAD_STORAGE_KEY))
  return Number.isFinite(last) && now >= last && now - last < RELOAD_WINDOW_MS
}

export function markPageOutdated(): void {
  isOutdated = true
}

// Recebe o payload do vite:preloadError, que é o mesmo erro rejeitado pelo
// import e entregue ao Errored.
export function recordChunkFailure(error: unknown): void {
  isOutdated = true
  if (typeof error === 'object' && error !== null) chunkFailures.add(error)
}

export function isVersionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  return (
    chunkFailures.has(error) ||
    ('unknownFunction' in error && error.unknownFunction === true)
  )
}

// Sem sessionStorage não há como provar que a recarga anterior não falhou do
// mesmo jeito; nesse caso a página de erro continua com a recarga manual.
export function claimOutdatedPageReload(): boolean {
  if (isOffline()) return false
  try {
    const now = Date.now()
    if (hasRecentReload(now)) return false
    globalThis.sessionStorage.setItem(RELOAD_STORAGE_KEY, String(now))
    return true
  } catch {
    return false
  }
}

export function createOutdatedPageGuard(): void {
  if (isServer) return
  useBeforeLeave(event => {
    if (event.defaultPrevented || typeof event.to === 'number') return
    if (!isOutdated || isOffline()) return
    const target = new URL(event.to, globalThis.location.href)
    // Query e hash seguem no client: um campo ligado à URL recarregaria a
    // página a cada tecla.
    if (
      target.origin !== globalThis.location.origin ||
      delocalizePathname(target.pathname) ===
        delocalizePathname(event.from.pathname)
    ) {
      return
    }
    event.preventDefault()
    if (event.options?.replace) globalThis.location.replace(target.href)
    else globalThis.location.assign(target.href)
  })
}
