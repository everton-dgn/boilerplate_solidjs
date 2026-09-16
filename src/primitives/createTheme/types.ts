import type { Accessor } from 'solid-js'

import type { ResolvedTheme, Theme } from '@/@types/theme.ts'

export type ThemeState = {
  theme: Accessor<Theme>
  resolvedTheme: Accessor<ResolvedTheme>
  systemTheme: Accessor<ResolvedTheme>
  ready: Accessor<boolean>
  setTheme: (theme: Theme) => void
}
