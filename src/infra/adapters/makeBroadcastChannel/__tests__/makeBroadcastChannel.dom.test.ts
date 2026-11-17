import { stubBroadcastChannel } from '@/tests/helpers/stubBroadcastChannel/index.ts'

import { makeBroadcastChannel } from '../index.ts'

const CHANNEL_NAME = 'test-channel'

let channel: ReturnType<typeof stubBroadcastChannel>

describe('generic channel between tabs', () => {
  beforeEach(() => {
    channel = stubBroadcastChannel()
  })

  it('delivers the received message without interpreting the content', () => {
    const receive = vi.fn<() => void>()
    const connection = makeBroadcastChannel({ name: CHANNEL_NAME, receive })
    onTestFinished(connection.dispose)
    channel.dispatchEvent(new MessageEvent('message', { data: { any: 1 } }))
    expect(receive).toHaveBeenCalledExactlyOnceWith({ any: 1 })
  })

  it('publishes the message on the channel', () => {
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

  it('works without an available BroadcastChannel', () => {
    vi.stubGlobal('BroadcastChannel', null)
    const connection = makeBroadcastChannel({
      name: CHANNEL_NAME,
      receive: vi.fn<() => void>()
    })
    expect(() => connection.post({})).not.toThrow()
    expect(() => connection.dispose()).not.toThrow()
  })

  it('closes the channel only once after a publish failure', () => {
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

  it('removes the listener and closes the channel on disposal', () => {
    const receive = vi.fn<() => void>()
    const connection = makeBroadcastChannel({ name: CHANNEL_NAME, receive })
    connection.dispose()
    channel.dispatchEvent(new MessageEvent('message', { data: { any: 1 } }))
    expect(receive).not.toHaveBeenCalled()
    expect(channel.close).toHaveBeenCalledExactlyOnceWith()
  })
})
