import { page, userEvent } from 'vite-plus/test/browser/context'

import { renderWithProviders } from '@/tests/providers/component'

import '../style.css'

import Home from './index.tsx'

describe('contador', () => {
  it('incrementa o contador no Chromium', async () => {
    renderWithProviders(() => <Home />)

    await userEvent.click(page.getByRole('button', { name: 'Count is 0' }))

    await expect
      .element(page.getByRole('button', { name: 'Count is 1' }))
      .toBeVisible()
  })

  it('aplica o CSS da aplicação no navegador', () => {
    const host = renderWithProviders(() => <Home />)
    const button = host.querySelector('button.counter')

    if (!(button instanceof HTMLButtonElement)) {
      throw new TypeError('Counter button not found')
    }

    expect(getComputedStyle(button).borderRadius).toBe('5px')
  })
})
