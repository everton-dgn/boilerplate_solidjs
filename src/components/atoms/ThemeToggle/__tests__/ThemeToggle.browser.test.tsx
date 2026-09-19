/* oxlint-disable unicorn/no-document-cookie -- Os testes exercitam a persistência e o bloqueio de cookie diretamente. */
import { page, userEvent } from 'vite-plus/test/browser/context'

import { THEME_COOKIE_NAME } from '@/constants/theme.ts'
import { readTheme } from '@/infra/adapters/themeStorage/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { ThemeToggle } from '../index.tsx'

describe('seletor de tema', () => {
  beforeEach(
    () =>
      (document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`)
  )
  afterEach(
    () =>
      (document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`)
  )

  it('seleciona cada preferência e atualiza o estado acessível', async () => {
    renderComponent(() => <ThemeToggle />)
    const trigger = page.getByRole('button', { name: 'Selecionar tema' })
    await userEvent.click(trigger)
    for (const [label, value] of [
      ['Escuro', 'dark'],
      ['Claro', 'light'],
      ['Sistema', 'system']
    ]) {
      await userEvent.click(
        page.getByRole('menuitemradio', { name: label, exact: true })
      )
      await expect.poll(() => readTheme()).toBe(value)
      await userEvent.click(trigger)
      await expect
        .element(page.getByRole('menuitemradio', { name: label, exact: true }))
        .toHaveAttribute('aria-checked', 'true')
    }
    await userEvent.keyboard('{Escape}')
  })
})
