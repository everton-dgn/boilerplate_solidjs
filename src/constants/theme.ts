import type { Theme } from '@/@types/theme.ts'

export const THEMES: readonly Theme[] = ['light', 'dark', 'system']
export const DEFAULT_THEME: Theme = 'system'
export const THEME_COOKIE_NAME = 'app-theme'
export const THEME_COOKIE_MAX_AGE = 31_536_000
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'
export const THEME_COLORS = { light: '#ffffff', dark: '#09090b' }
