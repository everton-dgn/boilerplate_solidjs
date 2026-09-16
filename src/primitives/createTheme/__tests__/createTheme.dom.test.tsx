/* oxlint-disable unicorn/no-document-cookie -- Os testes exercitam a persistência e o bloqueio de cookie diretamente. */
import { useContext } from 'solid-js'

import { ThemeContext } from '@/components/atoms/Provider/context.ts'
import { THEME_COOKIE_NAME } from '@/constants/theme.ts'
import { readTheme, saveTheme } from '@/infra/adapters/themeStorage/index.ts'
import { blockCookie } from '@/tests/helpers/blockCookie/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import type { ThemeState } from '../types.ts'

describe('primitive de tema', () => {
  let state: ThemeState
  let media: EventTarget & { matches: boolean }

  beforeEach(() => {
    document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
    media = Object.assign(new EventTarget(), { matches: true })
    vi.stubGlobal('matchMedia', () => media)
    vi.stubGlobal('BroadcastChannel', null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  })

  function mount(): void {
    renderComponent(() => {
      state = useContext(ThemeContext)
      return <span>{state.resolvedTheme()}</span>
    })
  }

  it('segue o sistema sem preferência salva', async () => {
    mount()
    await expect.poll(() => state.ready()).toBe(true)
    expect(state.theme()).toBe('system')
    expect(state.resolvedTheme()).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.cookie).not.toContain(`${THEME_COOKIE_NAME}=`)
  })

  it('mantém escolha explícita quando o sistema muda', async () => {
    mount()
    await expect.poll(() => state.ready()).toBe(true)
    state.setTheme('light')
    media.dispatchEvent(new Event('change'))
    await expect.poll(() => state.resolvedTheme()).toBe('light')
    expect(readTheme()).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('reconcilia mudança de outra aba e remoção da preferência', async () => {
    mount()
    await expect.poll(() => state.ready()).toBe(true)
    saveTheme('light')
    globalThis.dispatchEvent(new Event('focus'))
    await expect.poll(() => state.theme()).toBe('light')
    document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
    globalThis.dispatchEvent(new Event('pageshow'))
    await expect.poll(() => state.theme()).toBe('system')
    expect(state.resolvedTheme()).toBe('dark')
  })

  it('continua alternando quando o armazenamento é bloqueado', async () => {
    const restore = blockCookie()
    mount()
    await expect.poll(() => state.ready()).toBe(true)
    state.setTheme('light')
    await expect.poll(() => state.resolvedTheme()).toBe('light')
    expect(readTheme()).toBeUndefined()
    restore()
  })

  it('mantém a escolha feita antes do canal iniciar', async () => {
    document.cookie = `${THEME_COOKIE_NAME}=dark; Path=/`
    mount()
    state.setTheme('light')
    expect(document.documentElement).toHaveClass('light')
    expect(readTheme()).toBe('light')
    await expect.poll(() => state.ready()).toBe(true)
    expect(state.theme()).toBe('light')
    expect(document.documentElement).toHaveClass('light')
  })

  it('aplica o tema antes de tentar gravar o cookie', async () => {
    mount()
    await expect.poll(() => state.ready()).toBe(true)
    const applied: boolean[] = []
    vi.spyOn(document, 'cookie', 'set').mockImplementation(() => {
      applied.push(document.documentElement.classList.contains('light'))
    })
    state.setTheme('light')
    expect(applied).toStrictEqual([true])
  })
})

type TestChannel = EventTarget & {
  postMessage: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

describe('primitive de tema com canal entre abas', () => {
  let state: ThemeState
  let channel: TestChannel

  beforeEach(() => {
    document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
    channel = Object.assign(new EventTarget(), {
      postMessage: vi.fn<() => void>(),
      close: vi.fn<() => void>()
    })
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>()
    }))
    vi.stubGlobal(
      'BroadcastChannel',
      vi.fn(function makeChannel() {
        return channel
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  })

  it('aplica no DOM o tema recebido de outra aba', async () => {
    renderComponent(() => {
      state = useContext(ThemeContext)
      return <span>{state.resolvedTheme()}</span>
    })
    await expect.poll(() => state.ready()).toBe(true)
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
    await expect.poll(() => state.resolvedTheme()).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})
