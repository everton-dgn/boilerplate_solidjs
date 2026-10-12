import { For, Show } from 'solid-js'

import { MenuItemBase } from './MenuItemBase/index.tsx'
import { createMenuState } from './primitives/createMenuState/index.ts'
import { createOutsideDismiss } from './primitives/createOutsideDismiss/index.ts'
import { makeMenuKeyDown } from './primitives/makeMenuKeyDown/index.ts'
import { makeTriggerProps } from './primitives/makeTriggerProps/index.ts'
import type { DropdownMenuProps } from './types.ts'

import S from './styles.module.css'

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

  createOutsideDismiss(menu)

  return (
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
              <For each={[...items()]}>
                {item => (
                  <MenuItemBase
                    menu={menu}
                    checked={props.value === item.value}
                    disabled={item.disabled}
                    onSelect={() => props.onChange?.(item.value)}
                  >
                    <span class={S.radio_indicator} />
                    {item.icon}
                    {item.label}
                  </MenuItemBase>
                )}
              </For>
            )}
          </Show>
        </div>
      </Show>
    </div>
  )
}
