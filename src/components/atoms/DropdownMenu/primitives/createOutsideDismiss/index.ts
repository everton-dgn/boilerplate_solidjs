import { createEffect } from 'solid-js'

import type { DropdownMenuState } from '../../types.ts'

export function createOutsideDismiss(menu: DropdownMenuState): void {
  createEffect(
    () => menu.open(),
    isOpen => {
      const handlePointerDown = (event: Event) => {
        const { target } = event

        if (!(target instanceof Node)) return
        if (menu.refs.content?.contains(target)) return
        if (menu.refs.trigger?.contains(target)) return

        menu.close(false)
      }

      if (isOpen) {
        document.addEventListener('pointerdown', handlePointerDown, true)
      }

      return () =>
        document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  )
}
