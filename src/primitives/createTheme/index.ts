import {
  createEffect,
  createMemo,
  createSignal,
  onSettled,
  untrack
} from 'solid-js'

import type { ResolvedTheme, Theme } from '@/@types/theme.ts'
import { DEFAULT_THEME, THEME_COLORS } from '@/constants/theme.ts'
import { isTheme } from '@/helpers/isTheme/index.ts'
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
  const [ready, setReady] = createSignal(false)

  const resolvedTheme = createMemo(() => {
    const current = themePreference()
    return current === 'system' ? systemTheme() : current
  })

  let connection: ReturnType<typeof makeThemeChannel> | undefined

  createEffect(
    () => (ready() ? resolvedTheme() : undefined),
    resolved => {
      if (resolved !== undefined) apply(resolved)
    }
  )

  onSettled(() => {
    const system = makeSystemTheme(setSystemTheme)
    connection = makeThemeChannel(setThemePreference)
    setReady(true)
    return () => {
      connection?.dispose()
      connection = undefined
      system.dispose()
    }
  })

  return {
    theme: themePreference,
    systemTheme,
    resolvedTheme,
    ready,
    setTheme(next) {
      if (!isTheme(next)) return
      setThemePreference(next)
      apply(next === 'system' ? untrack(systemTheme) : next)
      const persisted = saveTheme(next)
      connection?.publish({ theme: next, persisted })
    }
  }
}
