import { DROPDOWN_FIRST_INDEX, DROPDOWN_LAST_INDEX } from '../../constants.ts'
import type {
  DropdownMenuState,
  DropdownMenuTriggerProps
} from '../../types.ts'

type TriggerIds = {
  trigger: string
  content: string
}

type TriggerPropsOptions = {
  menu: DropdownMenuState
  ids: TriggerIds
}

export function makeTriggerProps({
  menu,
  ids
}: TriggerPropsOptions): DropdownMenuTriggerProps {
  return {
    ref: element => {
      menu.refs.trigger = element
    },
    id: ids.trigger,
    type: 'button',
    'aria-haspopup': 'menu',
    get 'aria-expanded'() {
      return menu.open() ? 'true' : 'false'
    },
    get 'aria-controls'() {
      return menu.open() ? ids.content : undefined
    },
    onClick: () => {
      if (menu.open()) menu.close(false)
      else menu.openAt(DROPDOWN_FIRST_INDEX)
    },
    onKeyDown: event => {
      if (event.key === 'ArrowDown') menu.openAt(DROPDOWN_FIRST_INDEX)
      else if (event.key === 'ArrowUp') menu.openAt(DROPDOWN_LAST_INDEX)
      else return

      event.preventDefault()
    }
  }
}
