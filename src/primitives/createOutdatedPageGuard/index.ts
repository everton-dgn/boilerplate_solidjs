import { useBeforeLeave } from '@solidjs/router'
import { isServer } from '@solidjs/web'

import { delocalizePathname } from '@/i18n/urls/index.ts'

const RELOAD_STORAGE_KEY = 'outdated-page-reload'
// A failure that comes back right after the reload points to a new build that is
// also broken. The window breaks the loop without blocking the recovery from
// another deploy.
const RELOAD_WINDOW_MS = 30_000

type UnsavedChangesCheck = () => boolean
type RemoveUnsavedChanges = () => void

// The state only changes in the browser: the detectors run from entry-client,
// and the pages register the checks inside onSettled.
const chunkFailures = new WeakSet<object>()
const unsavedChangesChecks = new Set<UnsavedChangesCheck>()
let isOutdated = false

function isOffline(): boolean {
  return !globalThis.navigator.onLine
}

function hasUnsavedChanges(): boolean {
  for (const check of unsavedChangesChecks) if (check()) return true
  return false
}

function hasRecentReload(now: number): boolean {
  const last = Number(globalThis.sessionStorage.getItem(RELOAD_STORAGE_KEY))
  return Number.isFinite(last) && now >= last && now - last < RELOAD_WINDOW_MS
}

export function markPageOutdated(): void {
  isOutdated = true
}

// Receives the vite:preloadError payload, which is the same error rejected by
// the import and delivered to Errored.
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

// Without sessionStorage there is no way to prove that the previous reload did
// not fail the same way; in that case the error page keeps the manual reload.
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

export function registerUnsavedChanges(
  check: UnsavedChangesCheck
): RemoveUnsavedChanges {
  if (isServer) {
    return () => {
      // No check is registered on the server.
    }
  }

  // One entry per registration: the same check registered by two screens does
  // not lose the protection when one of them unmounts.
  const entry: UnsavedChangesCheck = () => check()
  unsavedChangesChecks.add(entry)
  return () => {
    unsavedChangesChecks.delete(entry)
  }
}

export function createOutdatedPageGuard(): void {
  if (isServer) return
  useBeforeLeave(event => {
    if (event.defaultPrevented || typeof event.to === 'number') return
    // This guard is subscribed before the routes and preventDefault is shared:
    // without the check, the draft guard of the page would never get to ask.
    if (!isOutdated || isOffline() || hasUnsavedChanges()) return
    const target = new URL(event.to, globalThis.location.href)
    // Query and hash stay on the client: a field bound to the URL would reload
    // the page on every key.
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
