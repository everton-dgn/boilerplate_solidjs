import type { JSX } from '@solidjs/web'

import { DROPDOWN_SELECT_KEYS } from '../constants.ts'
import type { DropdownMenuState } from '../types.ts'

import S from '../styles.module.css'

type MenuItemBaseProps = {
  menu: Pick<DropdownMenuState, 'close'>
  checked?: boolean
  disabled?: boolean
  onSelect: () => void
  children?: JSX.Element
}

export function MenuItemBase(props: MenuItemBaseProps) {
  const select = () => {
    if (props.disabled) return

    props.onSelect()
    props.menu.close(true)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!DROPDOWN_SELECT_KEYS.includes(event.key)) return

    event.preventDefault()
    select()
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
      onClick={select}
      onKeyDown={handleKeyDown}
    >
      {props.children}
    </button>
  )
}
