import type { Theme } from '@/@types/theme.ts'
import { DEFAULT_THEME, THEME_COOKIE_NAME } from '@/constants/theme.ts'
import { isTheme } from '@/helpers/isTheme/index.ts'

import { makeBroadcastChannel } from '../makeBroadcastChannel/index.ts'
import { readTheme } from '../themeStorage/index.ts'

type ThemeMessage = {
  theme: Theme
  persisted: boolean
  changedAt: number
  origin: string
}

type ThemeChoice = {
  theme: Theme
  persisted: boolean
}

type ThemeConnection = {
  publish: (choice: ThemeChoice) => void
  dispose: () => void
}

const ORIGIN_WORDS = 4

function isThemeMessage(message: unknown): message is ThemeMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'theme' in message &&
    isTheme(message.theme) &&
    'persisted' in message &&
    typeof message.persisted === 'boolean' &&
    'changedAt' in message &&
    typeof message.changedAt === 'number' &&
    Number.isSafeInteger(message.changedAt) &&
    message.changedAt > 0 &&
    'origin' in message &&
    typeof message.origin === 'string' &&
    message.origin.length > 0
  )
}

export function makeThemeChannel(
  receive: (theme: Theme) => void
): ThemeConnection {
  let temporary = false
  let observed: Theme | null | undefined
  const origin = crypto.getRandomValues(new Uint32Array(ORIGIN_WORDS)).join('-')
  let changedAt = 0
  let lastOrigin = ''

  const restore = (): void => {
    const saved = readTheme()
    if (saved === undefined) return
    if (!temporary || saved !== observed) {
      temporary = false
      receive(saved ?? DEFAULT_THEME)
    }
    observed = saved
  }

  const onVisible = (): void => {
    if (document.visibilityState === 'visible') restore()
  }

  const onMessage = (message: unknown): void => {
    if (!isThemeMessage(message)) return
    if (
      message.changedAt < changedAt ||
      (message.changedAt === changedAt && message.origin <= lastOrigin)
    ) {
      if (message.persisted) restore()
      return
    }
    ;({ changedAt } = message)
    lastOrigin = message.origin
    temporary = !message.persisted
    observed = readTheme()
    receive(
      message.persisted && observed !== undefined
        ? (observed ?? DEFAULT_THEME)
        : message.theme
    )
  }

  const channel = makeBroadcastChannel<ThemeMessage>({
    name: THEME_COOKIE_NAME,
    receive: onMessage
  })
  globalThis.addEventListener('focus', restore)
  globalThis.addEventListener('pageshow', restore)
  document.addEventListener('visibilitychange', onVisible)
  restore()

  return {
    publish({ theme, persisted }) {
      changedAt = Math.max(Date.now(), changedAt + 1)
      lastOrigin = origin
      temporary = !persisted
      observed = readTheme()
      channel.post({ theme, persisted, changedAt, origin })
    },
    dispose() {
      channel.dispose()
      globalThis.removeEventListener('focus', restore)
      globalThis.removeEventListener('pageshow', restore)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }
}
