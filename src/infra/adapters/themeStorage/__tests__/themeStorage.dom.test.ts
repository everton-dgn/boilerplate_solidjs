import { blockCookie } from '@/tests/helpers/blockCookie/index.ts'
import { clearThemeCookie } from '@/tests/helpers/clearThemeCookie/index.ts'

import { readTheme, saveTheme } from '../index.ts'

describe('preference persistence in the cookie', () => {
  beforeEach(clearThemeCookie)

  it.each(['light', 'dark', 'system'] as const)(
    'writes and reads %s again',
    theme => {
      expect(saveTheme(theme)).toBe(true)
      expect(readTheme()).toBe(theme)
    }
  )

  it.each(['light', 'system'] as const)(
    'detects a silent rejection when writing %s without a previous cookie',
    theme => {
      vi.spyOn(document, 'cookie', 'set').mockImplementation(
        vi.fn<() => void>()
      )
      expect(saveTheme(theme)).toBe(false)
      expect(document.cookie).toBe('')
    }
  )

  it('detects a blocked write that keeps the old cookie', () => {
    saveTheme('light')
    vi.spyOn(document, 'cookie', 'set').mockImplementation(vi.fn<() => void>())
    expect(saveTheme('dark')).toBe(false)
    expect(readTheme()).toBe('light')
  })

  it('tolerates exceptions in the read and the write', () => {
    blockCookie()
    expect(readTheme()).toBeUndefined()
    expect(saveTheme('dark')).toBe(false)
  })

  it('restricts the cookie to the host and uses Secure on HTTPS', () => {
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
