/* oxlint-disable unicorn/no-document-cookie -- Os testes exercitam a persistência e o bloqueio de cookie diretamente. */
import { THEME_COOKIE_NAME } from '@/constants/theme.ts'

import { makeThemeChannel } from '../index.ts'

const NOW = 10
const SECOND_CALL = 2

let channel: EventTarget & {
  postMessage: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}
function setup(): void {
  document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  channel = Object.assign(new EventTarget(), {
    postMessage: vi.fn<() => void>(),
    close: vi.fn<() => void>()
  })
  vi.stubGlobal(
    'BroadcastChannel',
    vi.fn(function makeChannel() {
      return channel
    })
  )
}

function cleanup(): void {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

describe('sincronização de tema', () => {
  beforeEach(setup)
  afterEach(cleanup)

  it('ignora mensagens inválidas e usa cookie canônico para escritas persistidas', () => {
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    receive.mockClear()
    for (const data of [
      null,
      'dark',
      {},
      { theme: 'invalid', persisted: true, changedAt: 1, origin: 'remote' },
      { theme: 'dark', persisted: true }
    ]) {
      channel.dispatchEvent(new MessageEvent('message', { data }))
    }
    expect(receive).not.toHaveBeenCalled()
    document.cookie = `${THEME_COOKIE_NAME}=light; Path=/`
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: { theme: 'dark', persisted: true, changedAt: 1, origin: 'remote' }
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
          persisted: false,
          changedAt: 1,
          origin: 'remote'
        }
      })
    )
    document.dispatchEvent(new Event('visibilitychange'))
    expect(receive).toHaveBeenLastCalledWith('dark')
    sync.publish({ theme: 'light', persisted: false })
    expect(channel.postMessage).toHaveBeenCalledExactlyOnceWith({
      theme: 'light',
      persisted: false,
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
    document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
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
          persisted: false,
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
    sync.publish({ theme: 'dark', persisted: false })
    receive.mockClear()
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'light',
          persisted: true,
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
  afterEach(cleanup)

  it('descarta mensagem temporária anterior à escolha local persistida', () => {
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    document.cookie = `${THEME_COOKIE_NAME}=dark; Path=/`
    sync.publish({ theme: 'dark', persisted: true })
    receive.mockClear()
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'light',
          persisted: false,
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
    sync.publish({ theme: 'dark', persisted: true })
    receive.mockClear()
    document.cookie = `${THEME_COOKIE_NAME}=light; Path=/`
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'dark',
          persisted: true,
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
          persisted: true,
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
    sync.publish({ theme: 'dark', persisted: false })
    receive.mockClear()
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'light',
          persisted: true,
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
    sync.publish({ theme: 'light', persisted: false })
    sync.publish({ theme: 'dark', persisted: false })
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
          data: { theme, persisted: false, changedAt: 12, origin }
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
    sync.publish({ theme: 'dark', persisted: false })
    receive.mockClear()
    document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
    globalThis.dispatchEvent(new Event('focus'))
    expect(receive).toHaveBeenLastCalledWith('system')
  })
})

describe('ciclo de vida do canal de tema', () => {
  beforeEach(setup)
  afterEach(cleanup)

  it('remove listeners e fecha o canal ao descartar', () => {
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    sync.dispose()
    receive.mockClear()
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
    expect(() => sync.publish({ theme: 'dark', persisted: true })).not.toThrow()
    expect(channel.close).toHaveBeenCalledExactlyOnceWith()
    sync.dispose()
  })
})
