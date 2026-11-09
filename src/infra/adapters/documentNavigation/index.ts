import type { BeforeLeaveEventArgs } from '@solidjs/router'

type NavigateDocumentOptions = { href: string; shouldReplace?: boolean }

// Histórico (`to` numérico) e navegações já canceladas por outro guard ficam
// com o roteador.
export function readLeaveTarget(event: BeforeLeaveEventArgs): URL | undefined {
  if (event.defaultPrevented || typeof event.to === 'number') return undefined
  return new URL(event.to, globalThis.location.href)
}

export function navigateDocument({
  href,
  shouldReplace
}: NavigateDocumentOptions): void {
  if (shouldReplace) globalThis.location.replace(href)
  else globalThis.location.assign(href)
}
