import type { BeforeLeaveEventArgs } from '@solidjs/router'

import { navigateDocument, readLeaveTarget } from '../index.ts'

type LeaveEventOptions = { to: string | number; isPrevented?: boolean }

function leaveEvent({
  to,
  isPrevented = false
}: LeaveEventOptions): BeforeLeaveEventArgs {
  return {
    from: {
      pathname: '/pt',
      search: '',
      hash: '',
      query: {},
      state: null,
      key: ''
    },
    to,
    defaultPrevented: isPrevented,
    preventDefault: vi.fn<() => void>(),
    retry: vi.fn<() => void>()
  }
}

describe('navegação de documento', () => {
  it('resolve o destino relativo à página atual', () => {
    const target = readLeaveTarget(leaveEvent({ to: '/pt/docs?q=1#part' }))

    expect(target?.href).toBe(
      new URL('/pt/docs?q=1#part', globalThis.location.href).href
    )
  })

  it.each([
    { to: -1, isPrevented: false },
    { to: '/pt/docs', isPrevented: true }
  ])(
    'deixa com o roteador o histórico e a navegação cancelada: %o',
    options => {
      expect(readLeaveTarget(leaveEvent(options))).toBeUndefined()
    }
  )

  it('troca a entrada do histórico só quando pedido', () => {
    const assign = vi
      .spyOn(globalThis.location, 'assign')
      .mockImplementation(() => {
        /* Mantém este teste no próprio documento. */
      })
    const replace = vi
      .spyOn(globalThis.location, 'replace')
      .mockImplementation(() => {
        /* Mantém este teste no próprio documento. */
      })

    navigateDocument({ href: '/pt/docs' })
    navigateDocument({ href: '/es/docs', shouldReplace: true })

    expect(assign).toHaveBeenCalledExactlyOnceWith('/pt/docs')
    expect(replace).toHaveBeenCalledExactlyOnceWith('/es/docs')
  })
})
