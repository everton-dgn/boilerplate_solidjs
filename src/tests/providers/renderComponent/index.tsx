import { render, type JSX } from '@solidjs/web'

import { Provider } from '@/components/molecules/Provider/index.tsx'

type RenderComponentOptions = {
  hasProviders?: boolean
}

export function renderComponent(
  component: () => JSX.Element,
  options: RenderComponentOptions = {}
): HTMLDivElement {
  const host = document.createElement('div')
  document.body.append(host)

  let dispose: (() => void) | undefined = undefined

  onTestFinished(() => {
    dispose?.()
    host.remove()
  })

  dispose = render(
    options.hasProviders === false
      ? component
      : () => <Provider>{component()}</Provider>,
    host
  )

  return host
}
