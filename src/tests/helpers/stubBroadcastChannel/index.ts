import type { Mock } from 'vite-plus/test'

type FakeChannel = EventTarget & {
  postMessage: Mock<(message: unknown) => void>
  close: Mock<() => void>
}

export function stubBroadcastChannel(): FakeChannel {
  const channel: FakeChannel = Object.assign(new EventTarget(), {
    postMessage: vi.fn<(message: unknown) => void>(),
    close: vi.fn<() => void>()
  })
  vi.stubGlobal(
    'BroadcastChannel',
    vi.fn(function makeChannel() {
      return channel
    })
  )
  return channel
}
