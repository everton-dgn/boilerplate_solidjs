import { Show, useContext } from 'solid-js'
import IconComputer from '~icons/hugeicons/computer'
import IconLoader from '~icons/hugeicons/loader-circle'
import IconMoon from '~icons/hugeicons/moon-02'
import IconSun from '~icons/hugeicons/sun-01'

import type { Theme } from '@/@types/theme.ts'
import { m } from '@/paraglide/messages.js'

import { Button } from '../Button/index.tsx'
import { DropdownMenu } from '../DropdownMenu/index.tsx'
import { ThemeContext } from '../Provider/context.ts'

export function ThemeToggle() {
  const state = useContext(ThemeContext)

  return (
    <DropdownMenu<Theme>
      label={m.themeToggle_label()}
      value={state.theme()}
      onChange={state.setTheme}
      items={[
        {
          value: 'light',
          label: m.themeToggle_light(),
          icon: <IconSun />
        },
        {
          value: 'dark',
          label: m.themeToggle_dark(),
          icon: <IconMoon />
        },
        {
          value: 'system',
          label: m.themeToggle_system(),
          icon: <IconComputer />
        }
      ]}
      trigger={props => (
        <Button
          {...props}
          variant="ghost"
          size="icon"
          aria-label={m.themeToggle_select()}
          aria-busy={state.ready() ? 'false' : 'true'}
          disabled={!state.ready()}
        >
          <Show when={state.ready()} fallback={<IconLoader class="spinner" />}>
            <Show
              when={state.theme() === 'system'}
              fallback={
                <Show when={state.theme() === 'dark'} fallback={<IconSun />}>
                  <IconMoon />
                </Show>
              }
            >
              <IconComputer />
            </Show>
          </Show>
        </Button>
      )}
    />
  )
}
