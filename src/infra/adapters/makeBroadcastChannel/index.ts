type BroadcastChannelOptions = {
  name: string
  receive: (message: unknown) => void
}

type ChannelConnection<T> = {
  post: (message: T) => void
  dispose: () => void
}

export function makeBroadcastChannel<T>({
  name,
  receive
}: BroadcastChannelOptions): ChannelConnection<T> {
  let channel: BroadcastChannel | undefined
  try {
    channel = new BroadcastChannel(name)
  } catch {
    channel = undefined
  }

  const onMessage = (event: MessageEvent<unknown>): void => {
    receive(event.data)
  }
  channel?.addEventListener('message', onMessage)
  const send = channel?.postMessage.bind(channel)

  const release = (): void => {
    if (!channel) return
    channel.removeEventListener('message', onMessage)
    channel.close()
    channel = undefined
  }

  return {
    post(message) {
      if (!channel) return
      try {
        send?.(message)
      } catch {
        release()
      }
    },
    dispose: release
  }
}
