import { blockCookie } from '@/tests/helpers/blockCookie/index.ts'
import { clearThemeCookie } from '@/tests/helpers/clearThemeCookie/index.ts'

import { readTheme, saveTheme } from '../index.ts'

describe('persistência da preferência no cookie', () => {
  beforeEach(clearThemeCookie)

  afterEach(clearThemeCookie)

  it.each(['light', 'dark', 'system'] as const)('grava e relê %s', theme => {
    expect(saveTheme(theme)).toBe(true)
    expect(readTheme()).toBe(theme)
  })

  it.each(['light', 'system'] as const)(
    'detecta rejeição silenciosa ao gravar %s sem cookie anterior',
    theme => {
      vi.spyOn(document, 'cookie', 'set').mockImplementation(
        vi.fn<() => void>()
      )
      expect(saveTheme(theme)).toBe(false)
      expect(document.cookie).toBe('')
    }
  )

  it('detecta escrita bloqueada mantendo o cookie antigo', () => {
    saveTheme('light')
    vi.spyOn(document, 'cookie', 'set').mockImplementation(vi.fn<() => void>())
    expect(saveTheme('dark')).toBe(false)
    expect(readTheme()).toBe('light')
  })

  it('tolera exceções na leitura e na escrita', () => {
    const restore = blockCookie()
    expect(readTheme()).toBeUndefined()
    expect(saveTheme('dark')).toBe(false)
    restore()
  })

  it('restringe o cookie ao host e usa Secure em HTTPS', () => {
    vi.stubGlobal('location', { protocol: 'https:' })
    const write = vi
      .spyOn(document, 'cookie', 'set')
      .mockImplementation(vi.fn<() => void>())
    saveTheme('dark')
    expect(write).toHaveBeenCalledExactlyOnceWith(
      'app-theme=dark; Path=/; Max-Age=31536000; Secure; SameSite=Lax'
    )
  })
})
