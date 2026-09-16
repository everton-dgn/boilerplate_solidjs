import type { JSX } from '@solidjs/web'
import { useContext } from 'solid-js'

import { DROPDOWN_SELECT_KEYS } from '../constants.ts'
import { DropdownMenuContext } from '../context.ts'

import S from '../styles.module.css'

type MenuItemBaseProps = {
  checked?: boolean
  disabled?: boolean
  class?: string
  onSelect: () => void
  children?: JSX.Element
}

export function MenuItemBase(props: MenuItemBaseProps) {
  const menu = useContext(DropdownMenuContext)

  const select = (dismiss: () => void) => {
    if (props.disabled) return

    props.onSelect()
    dismiss()
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!DROPDOWN_SELECT_KEYS.includes(event.key)) return

    event.preventDefault()
    select(() => menu.close(true))
  }

  return (
    <button
      type="button"
      data-dropdown-item=""
      role="menuitemradio"
      tabindex={-1}
      aria-checked={props.checked ? 'true' : 'false'}
      aria-disabled={props.disabled ? 'true' : undefined}
      class={[S.item, props.class]}
      onClick={() => select(menu.closeAfterSelect)}
      onKeyDown={handleKeyDown}
    >
      {props.children}
    </button>
  )
}
