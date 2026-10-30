import { createEffect, createSignal, onSettled, untrack } from 'solid-js'

import type { ResolvedTheme, Theme } from '@/@types/theme.ts'
import { DEFAULT_THEME, THEME_COLORS } from '@/constants/theme.ts'
import { applyTheme } from '@/infra/adapters/applyTheme/index.ts'
import { makeSystemTheme } from '@/infra/adapters/makeSystemTheme/index.ts'
import { makeThemeChannel } from '@/infra/adapters/makeThemeChannel/index.ts'
import { saveTheme } from '@/infra/adapters/themeStorage/index.ts'

import type { ThemeState } from './types.ts'

function apply(resolved: ResolvedTheme): void {
  applyTheme({ theme: resolved, color: THEME_COLORS[resolved] })
}

export function createTheme(): ThemeState {
  const [themePreference, setThemePreference] =
    createSignal<Theme>(DEFAULT_THEME)
  const [systemTheme, setSystemTheme] = createSignal<ResolvedTheme>('light')
  const [isReady, setIsReady] = createSignal(false)

  let connection: ReturnType<typeof makeThemeChannel> | undefined

  createEffect(
    () => {
      if (!isReady()) return null
      const current = themePreference()
      return current === 'system' ? systemTheme() : current
    },
    resolved => {
      if (resolved) apply(resolved)
    }
  )

  onSettled(() => {
    const system = makeSystemTheme(setSystemTheme)
    connection = makeThemeChannel(setThemePreference)
    setIsReady(true)
    return () => {
      connection?.dispose()
      connection = undefined
      system.dispose()
    }
  })

  return {
    theme: themePreference,
    isReady,
    setTheme(next) {
      setThemePreference(next)
      apply(next === 'system' ? untrack(systemTheme) : next)
      const isPersisted = saveTheme(next)
      connection?.publish({ theme: next, persisted: isPersisted })
    }
  }
}
