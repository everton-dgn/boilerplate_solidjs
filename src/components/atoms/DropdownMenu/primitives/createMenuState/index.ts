import { createSignal, createUniqueId, flush } from 'solid-js'

import { DROPDOWN_ITEM_SELECTOR } from '../../constants.ts'
import type { DropdownMenuRefs, DropdownMenuState } from '../../types.ts'

export function queryMenuItems(
  content: HTMLElement | undefined
): HTMLElement[] {
  if (!content) return []

  return [...content.querySelectorAll<HTMLElement>(DROPDOWN_ITEM_SELECTOR)]
}

export function createMenuState(): DropdownMenuState {
  const id = createUniqueId()
  const [open, setOpen] = createSignal(false)
  const refs: DropdownMenuRefs = {}
  let pointer = false

  const close = (restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) refs.trigger?.focus()
  }

  const focusAt = (index: number) => {
    const items = queryMenuItems(refs.content)
    const total = items.length

    if (total === 0) {
      refs.content?.focus()
      return
    }

    items[((index % total) + total) % total]?.focus()
  }

  return {
    id,
    open,
    refs,
    close,
    closeAfterSelect: () => close(!pointer),
    focusAt,
    openAt: (index: number) => {
      pointer = false
      setOpen(true)
      flush()
      focusAt(index)
    },
    setPointer: (value: boolean) => {
      pointer = value
    }
  }
}
