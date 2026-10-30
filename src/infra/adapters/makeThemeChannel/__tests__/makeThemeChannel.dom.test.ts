/* oxlint-disable unicorn/no-document-cookie -- Os testes exercitam a persistência e o bloqueio de cookie diretamente. */
import { THEME_COOKIE_NAME } from '@/constants/theme.ts'
import { clearThemeCookie } from '@/tests/helpers/clearThemeCookie/index.ts'
import { stubBroadcastChannel } from '@/tests/helpers/stubBroadcastChannel/index.ts'

import { makeThemeChannel } from '../index.ts'

const NOW = 10
const SECOND_CALL = 2

let channel: ReturnType<typeof stubBroadcastChannel>

function setup(): void {
  clearThemeCookie()
  channel = stubBroadcastChannel()
}

describe('sincronização de tema', () => {
  beforeEach(setup)

  it('ignora mensagens inválidas e usa cookie canônico para escritas persistidas', () => {
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    receive.mockClear()
    for (const data of [
      null,
      'dark',
      {},
      { theme: 'invalid', isPersisted: true, changedAt: 1, origin: 'remote' },
      { theme: 'dark', isPersisted: true }
    ]) {
      channel.dispatchEvent(new MessageEvent('message', { data }))
    }
    expect(receive).not.toHaveBeenCalled()
    document.cookie = `${THEME_COOKIE_NAME}=light; Path=/`
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'dark',
          isPersisted: true,
          changedAt: 1,
          origin: 'remote'
        }
      })
    )
    expect(receive).toHaveBeenLastCalledWith('light')
  })

  it('mantém escolha temporária após mensagem de escrita bloqueada', () => {
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
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
    document.dispatchEvent(new Event('visibilitychange'))
    expect(receive).toHaveBeenLastCalledWith('dark')
    sync.publish({ theme: 'light', isPersisted: false })
    expect(channel.postMessage).toHaveBeenCalledExactlyOnceWith({
      theme: 'light',
      isPersisted: false,
      changedAt: expect.any(Number) as unknown,
      origin: expect.any(String) as unknown
    })
  })

  it('relê o cookie ao recuperar foco sem BroadcastChannel', () => {
    vi.stubGlobal('BroadcastChannel', null)
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    document.cookie = `${THEME_COOKIE_NAME}=dark; Path=/`
    globalThis.dispatchEvent(new Event('focus'))
    expect(receive).toHaveBeenLastCalledWith('dark')
    clearThemeCookie()
    globalThis.dispatchEvent(new Event('pageshow'))
    expect(receive).toHaveBeenLastCalledWith('system')
  })

  it('preserva a escolha temporária até o cookie mudar', () => {
    document.cookie = `${THEME_COOKIE_NAME}=light; Path=/`
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
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
    globalThis.dispatchEvent(new Event('focus'))
    expect(receive).toHaveBeenLastCalledWith('dark')
    document.cookie = `${THEME_COOKIE_NAME}=system; Path=/`
    globalThis.dispatchEvent(new Event('focus'))
    expect(receive).toHaveBeenLastCalledWith('system')
  })

  it('não desfaz uma escolha temporária com mensagem persistida atrasada', () => {
    document.cookie = `${THEME_COOKIE_NAME}=light; Path=/`
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    sync.publish({ theme: 'dark', isPersisted: false })
    receive.mockClear()
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'light',
          isPersisted: true,
          changedAt: 1,
          origin: 'remote'
        }
      })
    )
    globalThis.dispatchEvent(new Event('focus'))
    expect(receive).not.toHaveBeenCalled()
  })

  it('relê a preferência somente quando a aba fica visível', () => {
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    receive.mockClear()
    document.cookie = `${THEME_COOKIE_NAME}=dark; Path=/`
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(receive).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(receive).toHaveBeenLastCalledWith('dark')
  })
})

describe('ordenação e escolhas temporárias', () => {
  beforeEach(setup)

  it('descarta mensagem temporária anterior à escolha local persistida', () => {
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    document.cookie = `${THEME_COOKIE_NAME}=dark; Path=/`
    sync.publish({ theme: 'dark', isPersisted: true })
    receive.mockClear()
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'light',
          isPersisted: false,
          changedAt: 1,
          origin: 'remote'
        }
      })
    )
    expect(receive).not.toHaveBeenCalled()
  })

  it('reconcilia o cookie atual mesmo com mensagem persistida antiga', () => {
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    document.cookie = `${THEME_COOKIE_NAME}=dark; Path=/`
    sync.publish({ theme: 'dark', isPersisted: true })
    receive.mockClear()
    document.cookie = `${THEME_COOKIE_NAME}=light; Path=/`
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'dark',
          isPersisted: true,
          changedAt: 1,
          origin: 'remote'
        }
      })
    )
    expect(receive).toHaveBeenCalledExactlyOnceWith('light')
  })

  it('aplica mensagem nova mesmo com leitura de cookie bloqueada', () => {
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    vi.spyOn(document, 'cookie', 'get').mockImplementation(() => {
      throw new Error('blocked')
    })
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'dark',
          isPersisted: true,
          changedAt: 1,
          origin: 'remote'
        }
      })
    )
    expect(receive).toHaveBeenLastCalledWith('dark')
  })

  it('aceita escolha persistida nova após escolha temporária', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    document.cookie = `${THEME_COOKIE_NAME}=light; Path=/`
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    sync.publish({ theme: 'dark', isPersisted: false })
    receive.mockClear()
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'light',
          isPersisted: true,
          changedAt: 11,
          origin: 'remote'
        }
      })
    )
    expect(receive).toHaveBeenLastCalledWith('light')
  })

  it('incrementa versões locais no mesmo instante e desempata mensagens', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    sync.publish({ theme: 'light', isPersisted: false })
    sync.publish({ theme: 'dark', isPersisted: false })
    expect(channel.postMessage).toHaveBeenNthCalledWith(
      SECOND_CALL,
      expect.objectContaining({ changedAt: 11 })
    )
    for (const [origin, theme] of [
      ['b', 'light'],
      ['a', 'dark'],
      ['b', 'dark']
    ]) {
      channel.dispatchEvent(
        new MessageEvent('message', {
          data: { theme, isPersisted: false, changedAt: 12, origin }
        })
      )
    }
    expect(receive).toHaveBeenLastCalledWith('light')
  })

  it('detecta remoção de cookie system após escolha temporária', () => {
    document.cookie = `${THEME_COOKIE_NAME}=system; Path=/`
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    sync.publish({ theme: 'dark', isPersisted: false })
    receive.mockClear()
    clearThemeCookie()
    globalThis.dispatchEvent(new Event('focus'))
    expect(receive).toHaveBeenLastCalledWith('system')
  })
})

describe('ciclo de vida do canal de tema', () => {
  beforeEach(setup)

  it('remove listeners e fecha o canal ao descartar', () => {
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    sync.dispose()
    receive.mockClear()
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
    globalThis.dispatchEvent(new Event('focus'))
    globalThis.dispatchEvent(new Event('pageshow'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(receive).not.toHaveBeenCalled()
    expect(channel.close).toHaveBeenCalledExactlyOnceWith()
  })

  it('tolera falha ao publicar no canal', () => {
    channel.postMessage.mockImplementation(() => {
      throw new Error('closed')
    })
    const sync = makeThemeChannel(vi.fn<() => void>())
    expect(() =>
      sync.publish({ theme: 'dark', isPersisted: true })
    ).not.toThrow()
    expect(channel.close).toHaveBeenCalledExactlyOnceWith()
    sync.dispose()
  })
})
