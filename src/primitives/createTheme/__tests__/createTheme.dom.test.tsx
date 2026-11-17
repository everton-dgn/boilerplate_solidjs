/* oxlint-disable unicorn/no-document-cookie -- The tests exercise the cookie persistence and blocking directly. */
import { flush, useContext } from 'solid-js'

import type { ResolvedTheme, Theme } from '@/@types/theme.ts'
import { ThemeContext } from '@/components/molecules/Provider/context.ts'
import { THEME_COOKIE_NAME } from '@/constants/theme.ts'
import { readTheme, saveTheme } from '@/infra/adapters/themeStorage/index.ts'
import { blockCookie } from '@/tests/helpers/blockCookie/index.ts'
import { clearThemeCookie } from '@/tests/helpers/clearThemeCookie/index.ts'
import { stubBroadcastChannel } from '@/tests/helpers/stubBroadcastChannel/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import type { ThemeState } from '../types.ts'

describe('theme primitive', () => {
  let state: ThemeState
  let media: EventTarget & { matches: boolean }

  beforeEach(() => {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.style.colorScheme = ''
    clearThemeCookie()
    media = Object.assign(new EventTarget(), { matches: true })
    vi.stubGlobal('matchMedia', () => media)
    vi.stubGlobal('BroadcastChannel', null)
  })

  function mount(): void {
    renderComponent(() => {
      state = useContext(ThemeContext)
      return <span>{state.theme()}</span>
    })
  }

  function changeSystemTheme(theme: ResolvedTheme): void {
    media.matches = theme === 'dark'
    media.dispatchEvent(new Event('change'))
    flush()
  }

  it('follows the system without a saved preference', async () => {
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    expect(state.theme()).toBe('system')
    expect(state.resolvedTheme()).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.cookie).not.toContain(`${THEME_COOKIE_NAME}=`)
  })

  it('follows the system change with the system preference', async () => {
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    changeSystemTheme('light')
    expect(state.resolvedTheme()).toBe('light')
    expect(document.documentElement).toHaveClass('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('keeps an explicit choice when the system changes', async () => {
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    state.setTheme('light')
    changeSystemTheme('light')
    changeSystemTheme('dark')
    expect(state.resolvedTheme()).toBe('light')
    expect(document.documentElement).toHaveClass('light')
    expect(readTheme()).toBe('light')
    state.setTheme('system')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('reconciles a change from another tab and the removal of the preference', async () => {
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    saveTheme('light')
    globalThis.dispatchEvent(new Event('focus'))
    await expect.poll(() => state.theme()).toBe('light')
    clearThemeCookie()
    globalThis.dispatchEvent(new Event('pageshow'))
    await expect.poll(() => state.theme()).toBe('system')
    await expect.poll(() => document.documentElement).toHaveClass('dark')
  })

  it('keeps switching when the storage is blocked', async () => {
    blockCookie()
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    state.setTheme('light')
    expect(document.documentElement).toHaveClass('light')
    expect(readTheme()).toBeUndefined()
  })

  it('ignores an invalid theme received through a cast', async () => {
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    state.setTheme('light')
    flush()
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Simulates an external value that reaches setTheme without type validation.
    const invalid = 'sepia' as unknown as Theme
    state.setTheme(invalid)
    flush()
    expect(state.theme()).toBe('light')
    expect(document.documentElement).toHaveClass('light')
    expect(document.documentElement).not.toHaveClass('dark')
    expect(readTheme()).toBe('light')
  })

  it('keeps the choice made right after mounting', async () => {
    document.cookie = `${THEME_COOKIE_NAME}=dark; Path=/`
    mount()
    state.setTheme('light')
    expect(document.documentElement).toHaveClass('light')
    expect(readTheme()).toBe('light')
    await expect.poll(() => state.isReady()).toBe(true)
    expect(state.theme()).toBe('light')
    expect(document.documentElement).toHaveClass('light')
  })

  it('applies the theme before trying to write the cookie', async () => {
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    const applied: boolean[] = []
    vi.spyOn(document, 'cookie', 'set').mockImplementation(() => {
      applied.push(document.documentElement.classList.contains('light'))
    })
    state.setTheme('light')
    expect(applied).toStrictEqual([true])
  })

  it('applies to the DOM the theme received from another tab', async () => {
    media.matches = false
    const channel = stubBroadcastChannel()
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    expect(document.documentElement).toHaveClass('light')
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'dark',
          isPersisted: false,
          changedAt: 1,
          origin: 'remote'
        }
      })
    )
    await expect.poll(() => state.theme()).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})
