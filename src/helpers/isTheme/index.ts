import type { Theme } from '@/@types/theme.ts'
import { THEMES } from '@/constants/theme.ts'

const themeValues: readonly unknown[] = THEMES

export function isTheme(value: unknown): value is Theme {
  return themeValues.includes(value)
}
