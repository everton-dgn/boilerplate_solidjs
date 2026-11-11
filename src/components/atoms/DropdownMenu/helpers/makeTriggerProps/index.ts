import { DROPDOWN_FIRST_INDEX, DROPDOWN_OPEN_INDEX } from '../../constants.ts'
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
      return menu.isOpen() ? 'true' : 'false'
    },
    get 'aria-controls'() {
      return menu.isOpen() ? ids.content : undefined
    },
    onClick: () => {
      if (menu.isOpen()) menu.close(false)
      else menu.openAt(DROPDOWN_FIRST_INDEX)
    },
    onKeyDown: event => {
      const index = DROPDOWN_OPEN_INDEX[event.key]
      if (index === undefined) return

      menu.openAt(index)
      event.preventDefault()
    }
  }
}
