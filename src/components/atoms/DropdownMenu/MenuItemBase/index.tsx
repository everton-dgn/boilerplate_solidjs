import type { JSX } from '@solidjs/web'

import { DROPDOWN_SELECT_KEYS } from '../constants.ts'
import type { DropdownMenuState } from '../types.ts'

import S from '../styles.module.css'

type MenuItemBaseProps = {
  menu: Pick<DropdownMenuState, 'close' | 'closeAfterSelect'>
  checked?: boolean
  disabled?: boolean
  onSelect: () => void
  children?: JSX.Element
}

export function MenuItemBase(props: MenuItemBaseProps) {
  const select = (dismiss: () => void) => {
    if (props.disabled) return

    props.onSelect()
    dismiss()
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!DROPDOWN_SELECT_KEYS.includes(event.key)) return

    event.preventDefault()
    const { close } = props.menu
    select(() => close(true))
  }

  return (
    <button
      type="button"
      data-dropdown-item=""
      role="menuitemradio"
      tabindex={-1}
      aria-checked={props.checked ? 'true' : 'false'}
      aria-disabled={props.disabled ? 'true' : undefined}
      class={S.item}
      onClick={() => select(props.menu.closeAfterSelect)}
      onKeyDown={handleKeyDown}
    >
      {props.children}
    </button>
  )
}
