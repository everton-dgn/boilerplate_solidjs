import {
  type Accessor,
  createEffect,
  createSignal,
  createUniqueId,
  flush
} from 'solid-js'

import {
  DROPDOWN_ITEM_SELECTOR,
  DROPDOWN_NAVIGATION,
  DROPDOWN_OPEN_INDEX
} from '../constants.ts'
import type { DropdownMenuTriggerProps } from '../types.ts'

type MenuIds = {
  trigger: string
  content: string
}

type MenuState = {
  ids: MenuIds
  isOpen: Accessor<boolean>
  setContent: (element: HTMLElement) => void
  close: (shouldRestoreFocus: boolean) => void
  triggerProps: DropdownMenuTriggerProps
  onMenuKeyDown: (event: KeyboardEvent) => void
}

function queryMenuItems(content: HTMLElement | undefined): HTMLElement[] {
  if (!content) return []

  return [...content.querySelectorAll<HTMLElement>(DROPDOWN_ITEM_SELECTOR)]
}

function activeIndex(items: readonly HTMLElement[]): number {
  const { activeElement } = document

  if (!(activeElement instanceof HTMLElement)) return 0

  return Math.max(0, items.indexOf(activeElement))
}

export function createMenuState(): MenuState {
  const id = createUniqueId()
  const ids = {
    trigger: `dropdown-trigger-${id}`,
    content: `dropdown-content-${id}`
  }
  const [isOpen, setIsOpen] = createSignal(false)
  let trigger: HTMLButtonElement | undefined
  let content: HTMLElement | undefined

  const close = (shouldRestoreFocus: boolean) => {
    setIsOpen(false)
    if (shouldRestoreFocus) trigger?.focus()
  }

  const focusAt = (index: number) => {
    const items = queryMenuItems(content)
    const total = items.length

    if (total === 0) {
      content?.focus()
      return
    }

    items[((index % total) + total) % total]?.focus()
  }

  const openAt = (index: number) => {
    setIsOpen(true)
    flush()
    focusAt(index)
  }

  const handlePointerDown = (event: Event) => {
    const { target } = event

    if (!(target instanceof Node)) return
    if (content?.contains(target)) return
    if (trigger?.contains(target)) return

    close(false)
  }

  createEffect(
    () => isOpen(),
    isMenuOpen => {
      if (isMenuOpen) {
        document.addEventListener('pointerdown', handlePointerDown, true)
      }

      return () =>
        document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  )

  return {
    ids,
    isOpen,
    setContent: element => {
      content = element
    },
    close,
    triggerProps: {
      ref: element => {
        trigger = element
      },
      id: ids.trigger,
      type: 'button',
      'aria-haspopup': 'menu',
      get 'aria-expanded'() {
        return isOpen() ? 'true' : 'false'
      },
      get 'aria-controls'() {
        return isOpen() ? ids.content : undefined
      },
      onClick: () => {
        if (isOpen()) close(false)
        else openAt(0)
      },
      onKeyDown: event => {
        const index = DROPDOWN_OPEN_INDEX[event.key]
        if (index === undefined) return

        openAt(index)
        event.preventDefault()
      }
    },
    onMenuKeyDown: event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(true)
        return
      }

      if (event.key === 'Tab') {
        close(true)
        return
      }

      const next = DROPDOWN_NAVIGATION[event.key]?.(
        activeIndex(queryMenuItems(content))
      )

      if (next === undefined) return

      event.preventDefault()
      focusAt(next)
    }
  }
}
