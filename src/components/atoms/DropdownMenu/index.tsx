import { For, Show, useContext } from 'solid-js'

import { DropdownMenuContext, DropdownMenuRadioContext } from './context.ts'
import { MenuItemBase } from './MenuItemBase/index.tsx'
import { createMenuState } from './primitives/createMenuState/index.ts'
import { createOutsideDismiss } from './primitives/createOutsideDismiss/index.ts'
import { makeMenuKeyDown } from './primitives/makeMenuKeyDown/index.ts'
import { makeTriggerProps } from './primitives/makeTriggerProps/index.ts'
import type {
  DropdownMenuProps,
  DropdownMenuRadioGroupProps,
  DropdownMenuRadioItemProps
} from './types.ts'

import S from './styles.module.css'

function DropdownMenuRadioGroup(props: DropdownMenuRadioGroupProps) {
  return (
    <DropdownMenuRadioContext
      value={{
        selected: () => props.value,
        select: value => props.onChange?.(value)
      }}
    >
      {props.children}
    </DropdownMenuRadioContext>
  )
}

function DropdownMenuRadioItem(props: DropdownMenuRadioItemProps) {
  const radio = useContext(DropdownMenuRadioContext)

  return (
    <MenuItemBase
      checked={radio.selected() === props.value}
      disabled={props.disabled}
      class={props.class}
      onSelect={() => radio.select(props.value)}
    >
      {props.children}
    </MenuItemBase>
  )
}

export function DropdownMenu<Value extends string = string>(
  props: DropdownMenuProps<Value>
) {
  const menu = createMenuState()
  const ids = {
    trigger: `dropdown-trigger-${menu.id}`,
    content: `dropdown-content-${menu.id}`
  }
  const triggerProps = makeTriggerProps({ menu, ids })
  const handleKeyDown = makeMenuKeyDown(menu)

  const handleChange = (value: string) => {
    const match = props.items?.find(item => item.value === value)

    if (match) props.onChange?.(match.value)
  }

  createOutsideDismiss(menu)

  return (
    <DropdownMenuContext
      value={{ close: menu.close, closeAfterSelect: menu.closeAfterSelect }}
    >
      <div class={[S.root, props.class]}>
        {props.trigger(triggerProps)}

        <Show when={menu.open()}>
          <div
            ref={node => {
              menu.refs.content = node
            }}
            id={ids.content}
            role="menu"
            tabindex={-1}
            aria-label={props.label}
            aria-labelledby={props.label ? undefined : ids.trigger}
            class={[
              S.content,
              props.align === 'start' ? S.align_start : S.align_end,
              props.contentClass
            ]}
            onKeyDown={handleKeyDown}
            onPointerDown={() => menu.setPointer(true)}
          >
            <Show when={props.items}>
              {items => (
                <DropdownMenuRadioGroup
                  value={props.value}
                  onChange={handleChange}
                >
                  <For each={[...items()]}>
                    {item => (
                      <DropdownMenuRadioItem
                        value={item.value}
                        disabled={item.disabled}
                      >
                        <span class={S.radio_indicator} />
                        {item.icon}
                        {item.label}
                      </DropdownMenuRadioItem>
                    )}
                  </For>
                </DropdownMenuRadioGroup>
              )}
            </Show>
          </div>
        </Show>
      </div>
    </DropdownMenuContext>
  )
}
