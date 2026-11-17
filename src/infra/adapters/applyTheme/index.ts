import type { ResolvedTheme } from '@/@types/theme.ts'

type AppliedTheme = {
  theme: ResolvedTheme
  color: string
}

// Document serializes this function in the pre-hydration script; keep the body self-contained.
export function applyTheme({ theme, color }: AppliedTheme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')
  root.style.colorScheme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', color)
}
