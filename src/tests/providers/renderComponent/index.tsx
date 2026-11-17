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

  // WHY: registered before the render to remove the host even if it throws; the
  // hooks run in reverse order, so the dispose below runs first.
  onTestFinished(() => host.remove())

  const dispose = render(
    options.hasProviders === false
      ? component
      : () => <Provider>{component()}</Provider>,
    host
  )
  onTestFinished(dispose)

  return host
}
