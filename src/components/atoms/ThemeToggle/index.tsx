import { m } from '@paraglide/messages.js'
import { dynamicComponent } from '@solidjs/web'
import { Show, useContext } from 'solid-js'
import IconComputer from '~icons/hugeicons/computer'
import IconLoader from '~icons/hugeicons/loader-circle'
import IconMoon from '~icons/hugeicons/moon-02'
import IconSun from '~icons/hugeicons/sun-01'

import type { Theme } from '@/@types/theme.ts'

import { Button } from '../Button/index.tsx'
import { DropdownMenu } from '../DropdownMenu/index.tsx'
import { ThemeContext } from '../Provider/context.ts'

const THEMES: readonly Theme[] = ['light', 'dark', 'system']

const THEME_OPTIONS = {
  light: { label: m.themeToggle_light, icon: IconSun },
  dark: { label: m.themeToggle_dark, icon: IconMoon },
  system: { label: m.themeToggle_system, icon: IconComputer }
}

export function ThemeToggle() {
  const state = useContext(ThemeContext)
  const ThemeIcon = dynamicComponent(() => THEME_OPTIONS[state.theme()].icon)

  return (
    <DropdownMenu<Theme>
      label={m.themeToggle_label()}
      value={state.theme()}
      onChange={state.setTheme}
      items={THEMES.map(theme => {
        const Icon = THEME_OPTIONS[theme].icon
        return {
          value: theme,
          label: THEME_OPTIONS[theme].label(),
          icon: <Icon />
        }
      })}
      trigger={props => (
        <Button
          {...props}
          variant="ghost"
          size="icon"
          aria-label={
            state.isReady()
              ? m.themeToggle_current({
                  theme: THEME_OPTIONS[state.theme()].label()
                })
              : m.themeToggle_select()
          }
          disabled={!state.isReady()}
        >
          <Show
            when={state.isReady()}
            fallback={<IconLoader class="spinner" />}
          >
            <ThemeIcon />
          </Show>
        </Button>
      )}
    />
  )
}
