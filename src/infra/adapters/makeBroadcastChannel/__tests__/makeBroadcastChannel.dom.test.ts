import { makeBroadcastChannel } from '../index.ts'

const CHANNEL_NAME = 'test-channel'

let channel: EventTarget & {
  postMessage: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

describe('canal genérico entre abas', () => {
  beforeEach(() => {
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
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('entrega a mensagem recebida sem interpretar o conteúdo', () => {
    const receive = vi.fn<() => void>()
    const connection = makeBroadcastChannel({ name: CHANNEL_NAME, receive })
    onTestFinished(connection.dispose)
    channel.dispatchEvent(new MessageEvent('message', { data: { any: 1 } }))
    expect(receive).toHaveBeenCalledExactlyOnceWith({ any: 1 })
  })

  it('publica a mensagem no canal', () => {
    const connection = makeBroadcastChannel<{ value: string }>({
      name: CHANNEL_NAME,
      receive: vi.fn<() => void>()
    })
    onTestFinished(connection.dispose)
    connection.post({ value: 'dark' })
    expect(channel.postMessage).toHaveBeenCalledExactlyOnceWith({
      value: 'dark'
    })
  })

  it('opera sem BroadcastChannel disponível', () => {
    vi.stubGlobal('BroadcastChannel', null)
    const connection = makeBroadcastChannel({
      name: CHANNEL_NAME,
      receive: vi.fn<() => void>()
    })
    expect(() => connection.post({})).not.toThrow()
    expect(() => connection.dispose()).not.toThrow()
  })

  it('fecha o canal uma única vez após falha ao publicar', () => {
    channel.postMessage.mockImplementation(() => {
      throw new Error('closed')
    })
    const receive = vi.fn<() => void>()
    const connection = makeBroadcastChannel({ name: CHANNEL_NAME, receive })
    expect(() => connection.post({})).not.toThrow()
    connection.post({})
    connection.dispose()
    expect(channel.close).toHaveBeenCalledExactlyOnceWith()
    expect(channel.postMessage).toHaveBeenCalledExactlyOnceWith({})
    channel.dispatchEvent(new MessageEvent('message', { data: { any: 1 } }))
    expect(receive).not.toHaveBeenCalled()
  })

  it('remove o listener e fecha o canal ao descartar', () => {
    const receive = vi.fn<() => void>()
    const connection = makeBroadcastChannel({ name: CHANNEL_NAME, receive })
    connection.dispose()
    channel.dispatchEvent(new MessageEvent('message', { data: { any: 1 } }))
    expect(receive).not.toHaveBeenCalled()
    expect(channel.close).toHaveBeenCalledExactlyOnceWith()
  })
})
