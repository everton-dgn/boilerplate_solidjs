import type { JSX } from '@solidjs/web'

type RememberOrigin = (origin: HTMLElement | undefined) => void

export function createFocusOriginHandler(
  remember: RememberOrigin
): JSX.FocusEventHandler<HTMLElement, FocusEvent> {
  return event => {
    const origin = event.relatedTarget
    if (origin instanceof Node && event.currentTarget.contains(origin)) return
    remember(origin instanceof HTMLElement ? origin : undefined)
  }
}
