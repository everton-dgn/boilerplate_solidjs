import type { ResolvedTheme } from '@/@types/theme.ts'
import { DARK_MEDIA_QUERY } from '@/constants/theme.ts'

type SystemTheme = {
  dispose: () => void
}

export function makeSystemTheme(
  receive: (theme: ResolvedTheme) => void
): SystemTheme {
  const media = globalThis.matchMedia(DARK_MEDIA_QUERY)
  const update = (): void => {
    receive(media.matches ? 'dark' : 'light')
  }
  media.addEventListener('change', update)
  update()

  return {
    dispose() {
      media.removeEventListener('change', update)
    }
  }
}
