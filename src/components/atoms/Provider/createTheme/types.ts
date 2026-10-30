import type { Accessor } from 'solid-js'

import type { Theme } from '@/@types/theme.ts'

export type ThemeState = {
  theme: Accessor<Theme>
  isReady: Accessor<boolean>
  setTheme: (theme: Theme) => void
}
