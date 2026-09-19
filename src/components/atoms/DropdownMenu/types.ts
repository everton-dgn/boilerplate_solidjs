import type { JSX } from '@solidjs/web'

type DropdownMenuAlign = 'start' | 'end'

type DropdownMenuOption<Value extends string = string> = {
  value: Value
  label: string
  icon?: JSX.Element
  disabled?: boolean
}

export type DropdownMenuTriggerProps = {
  ref: (element: HTMLButtonElement) => void
  id: string
  type: 'button'
  'aria-haspopup': 'menu'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string | undefined
  onClick: (event: MouseEvent) => void
  onKeyDown: (event: KeyboardEvent) => void
}

export type DropdownMenuProps<Value extends string = string> = {
  trigger: (props: DropdownMenuTriggerProps) => JSX.Element
  label?: string
  align?: DropdownMenuAlign
  class?: string
  contentClass?: string
  items?: readonly DropdownMenuOption<Value>[]
  value?: Value
  onChange?: (value: Value) => void
}

export type DropdownMenuRadioGroupProps = {
  value?: string
  onChange?: (value: string) => void
  children?: JSX.Element
}

export type DropdownMenuRadioItemProps = {
  value: string
  disabled?: boolean
  class?: string
  children?: JSX.Element
}

export type DropdownMenuRefs = {
  trigger?: HTMLButtonElement
  content?: HTMLElement
}

export type DropdownMenuState = {
  id: string
  open: () => boolean
  refs: DropdownMenuRefs
  close: (restoreFocus: boolean) => void
  closeAfterSelect: () => void
  focusAt: (index: number) => void
  openAt: (index: number) => void
  setPointer: (value: boolean) => void
}

export type DropdownMenuContextValue = {
  close: (restoreFocus: boolean) => void
  closeAfterSelect: () => void
}

export type DropdownMenuRadioContextValue = {
  selected: () => string | undefined
  select: (value: string) => void
}
