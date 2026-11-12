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

  // WHY: registrado antes do render para remover o host mesmo se ele lançar; os
  // hooks rodam em ordem inversa, então o dispose abaixo executa primeiro.
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
