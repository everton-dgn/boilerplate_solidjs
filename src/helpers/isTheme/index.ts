import type { Theme } from '@/@types/theme.ts'

const THEME_KEYS = {
  light: true,
  dark: true,
  system: true
} satisfies Record<Theme, true>

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && Object.hasOwn(THEME_KEYS, value)
}
