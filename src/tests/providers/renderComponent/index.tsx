import { render, type JSX } from '@solidjs/web'

import { Provider } from '@/components/atoms/Provider/index.tsx'

type RenderComponentOptions = {
  providers?: boolean
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
    options.providers === false
      ? component
      : () => <Provider>{component()}</Provider>,
    host
  )

  return host
}
