import { page, userEvent } from 'vite-plus/test/browser/context'

import { renderWithProviders } from '@/tests/providers/component'

import Home from './index.tsx'

describe('contador', () => {
  it('incrementa o contador no Chromium', async () => {
    renderWithProviders(() => <Home />)

    await userEvent.click(page.getByRole('button', { name: 'Count is 0' }))

    await expect
      .element(page.getByRole('button', { name: 'Count is 1' }))
      .toBeVisible()
  })
})
