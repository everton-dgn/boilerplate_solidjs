import { page, userEvent } from 'vite-plus/test/browser/context'

import { readTheme } from '@/infra/adapters/themeStorage/index.ts'
import { clearThemeCookie } from '@/tests/helpers/clearThemeCookie/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import '@/theme/globalStyles.css'

import { ThemeToggle } from '../index.tsx'

describe('seletor de tema', () => {
  beforeEach(clearThemeCookie)
  afterEach(clearThemeCookie)

  it('seleciona cada preferência e atualiza o estado acessível', async () => {
    renderComponent(() => <ThemeToggle />)
    const trigger = page.getByRole('button', { name: /^Select theme/u })
    await expect
      .element(trigger)
      .toHaveAccessibleName('Select theme, current: System')
    await expect.element(trigger).not.toHaveAttribute('aria-busy')
    await userEvent.click(trigger)
    for (const [label, value] of [
      ['Dark', 'dark'],
      ['Light', 'light'],
      ['System', 'system']
    ]) {
      await userEvent.click(
        page.getByRole('menuitemradio', { name: label, exact: true })
      )
      await expect.poll(() => readTheme()).toBe(value)
      await expect
        .element(trigger)
        .toHaveAccessibleName(`Select theme, current: ${label}`)
      await userEvent.click(trigger)
      await expect
        .element(page.getByRole('menuitemradio', { name: label, exact: true }))
        .toHaveAttribute('aria-checked', 'true')
    }
    await userEvent.keyboard('{Escape}')
  })
})
