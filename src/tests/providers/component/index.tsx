import { render, type JSX } from '@solidjs/web'

import { Provider } from '@/components/atoms/Provider'

export function renderWithProviders(
  component: () => JSX.Element
): HTMLDivElement {
  const host = document.createElement('div')
  onTestFinished(() => host.remove())

  document.body.append(host)
  const dispose = render(() => <Provider>{component()}</Provider>, host)
  onTestFinished(dispose)

  return host
}
