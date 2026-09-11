import { renderWithProviders } from '@/tests/providers/component'

import Home from './index.tsx'

describe('contador', () => {
  it('incrementa o contador', async () => {
    const host = renderWithProviders(() => <Home />)

    const button = host.querySelector('button.counter')

    if (!(button instanceof HTMLButtonElement)) {
      throw new TypeError('Counter button not found')
    }

    button.click()

    await expect.poll(() => button.textContent).toBe('Count is 1')
  })
})
