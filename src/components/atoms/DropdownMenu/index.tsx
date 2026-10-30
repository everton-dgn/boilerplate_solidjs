import { For, Show } from 'solid-js'

import { DROPDOWN_SELECT_KEYS } from './constants.ts'
import { createMenuState } from './createMenuState/index.ts'
import type { DropdownMenuProps } from './types.ts'

import S from './styles.module.css'

export function DropdownMenu<Value extends string = string>(
  props: DropdownMenuProps<Value>
) {
  const menu = createMenuState()

  return (
    <div class={S.root}>
      {props.trigger(menu.triggerProps)}

      <Show when={menu.isOpen()}>
        <div
          ref={menu.setContent}
          id={menu.ids.content}
          role="menu"
          tabindex={-1}
          aria-label={props.label}
          aria-labelledby={props.label ? undefined : menu.ids.trigger}
          class={S.content}
          onKeyDown={menu.onMenuKeyDown}
        >
          <For each={props.items}>
            {item => {
              const select = () => {
                if (item.disabled) return

                props.onChange?.(item.value)
                menu.close(true)
              }

              return (
                <button
                  type="button"
                  data-dropdown-item=""
                  role="menuitemradio"
                  tabindex={-1}
                  aria-checked={props.value === item.value ? 'true' : 'false'}
                  aria-disabled={item.disabled ? 'true' : undefined}
                  class={S.item}
                  onClick={select}
                  onKeyDown={event => {
                    if (!DROPDOWN_SELECT_KEYS.includes(event.key)) return

                    event.preventDefault()
                    select()
                  }}
                >
                  <span class={S.radio_indicator} />
                  {item.icon}
                  {item.label}
                </button>
              )
            }}
          </For>
        </div>
      </Show>
    </div>
  )
}
