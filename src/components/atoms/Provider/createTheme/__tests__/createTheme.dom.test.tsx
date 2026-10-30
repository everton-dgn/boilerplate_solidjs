/* oxlint-disable unicorn/no-document-cookie -- Os testes exercitam a persistência e o bloqueio de cookie diretamente. */
import { flush, useContext } from 'solid-js'

import type { ResolvedTheme } from '@/@types/theme.ts'
import { ThemeContext } from '@/components/atoms/Provider/context.ts'
import { THEME_COOKIE_NAME } from '@/constants/theme.ts'
import { readTheme, saveTheme } from '@/infra/adapters/themeStorage/index.ts'
import { blockCookie } from '@/tests/helpers/blockCookie/index.ts'
import { clearThemeCookie } from '@/tests/helpers/clearThemeCookie/index.ts'
import { stubBroadcastChannel } from '@/tests/helpers/stubBroadcastChannel/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import type { ThemeState } from '../types.ts'

describe('primitive de tema', () => {
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

  afterEach(clearThemeCookie)

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

  it('segue o sistema sem preferência salva', async () => {
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    expect(state.theme()).toBe('system')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.cookie).not.toContain(`${THEME_COOKIE_NAME}=`)
  })

  it('acompanha a mudança do sistema com a preferência system', async () => {
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    changeSystemTheme('light')
    expect(document.documentElement).toHaveClass('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('mantém escolha explícita quando o sistema muda', async () => {
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    state.setTheme('light')
    changeSystemTheme('light')
    changeSystemTheme('dark')
    expect(document.documentElement).toHaveClass('light')
    expect(readTheme()).toBe('light')
    state.setTheme('system')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('reconcilia mudança de outra aba e remoção da preferência', async () => {
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

  it('continua alternando quando o armazenamento é bloqueado', async () => {
    const restore = blockCookie()
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    state.setTheme('light')
    expect(document.documentElement).toHaveClass('light')
    expect(readTheme()).toBeUndefined()
    restore()
  })

  it('mantém a escolha feita antes do canal iniciar', async () => {
    document.cookie = `${THEME_COOKIE_NAME}=dark; Path=/`
    mount()
    state.setTheme('light')
    expect(document.documentElement).toHaveClass('light')
    expect(readTheme()).toBe('light')
    await expect.poll(() => state.isReady()).toBe(true)
    expect(state.theme()).toBe('light')
    expect(document.documentElement).toHaveClass('light')
  })

  it('aplica o tema antes de tentar gravar o cookie', async () => {
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    const applied: boolean[] = []
    vi.spyOn(document, 'cookie', 'set').mockImplementation(() => {
      applied.push(document.documentElement.classList.contains('light'))
    })
    state.setTheme('light')
    expect(applied).toStrictEqual([true])
  })

  it('aplica no DOM o tema recebido de outra aba', async () => {
    media.matches = false
    const channel = stubBroadcastChannel()
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    expect(document.documentElement).toHaveClass('light')
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'dark',
          persisted: false,
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
