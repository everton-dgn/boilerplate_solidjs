import { m } from '@paraglide/messages.js'
import { Show, useContext } from 'solid-js'
import IconComputer from '~icons/hugeicons/computer'
import IconLoader from '~icons/hugeicons/loader-circle'
import IconMoon from '~icons/hugeicons/moon-02'
import IconSun from '~icons/hugeicons/sun-01'

import type { Theme } from '@/@types/theme.ts'

import { Button } from '../Button/index.tsx'
import { DropdownMenu } from '../DropdownMenu/index.tsx'
import { ThemeContext } from '../Provider/context.ts'

const THEME_LABELS = {
  light: m.themeToggle_light,
  dark: m.themeToggle_dark,
  system: m.themeToggle_system
}

export function ThemeToggle() {
  const state = useContext(ThemeContext)

  return (
    <DropdownMenu<Theme>
      class="js_only"
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
          aria-label={
            state.isReady()
              ? m.themeToggle_current({ theme: THEME_LABELS[state.theme()]() })
              : m.themeToggle_select()
          }
          disabled={!state.isReady()}
        >
          <Show
            when={state.isReady()}
            fallback={<IconLoader class="spinner" />}
          >
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
