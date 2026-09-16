import { DROPDOWN_FIRST_INDEX, DROPDOWN_NAVIGATION } from '../../constants.ts'
import type { DropdownMenuState } from '../../types.ts'
import { queryMenuItems } from '../createMenuState/index.ts'

function activeIndex(items: readonly HTMLElement[]): number {
  const { activeElement } = document

  if (!(activeElement instanceof HTMLElement)) return DROPDOWN_FIRST_INDEX

  return Math.max(DROPDOWN_FIRST_INDEX, items.indexOf(activeElement))
}

export function makeMenuKeyDown(
  menu: DropdownMenuState
): (event: KeyboardEvent) => void {
  return event => {
    menu.setPointer(false)

    if (event.key === 'Escape') {
      event.preventDefault()
      menu.close(true)
      return
    }

    if (event.key === 'Tab') {
      menu.close(true)
      return
    }

    const next = DROPDOWN_NAVIGATION[event.key]?.(
      activeIndex(queryMenuItems(menu.refs.content))
    )

    if (next === undefined) return

    event.preventDefault()
    menu.focusAt(next)
  }
}
