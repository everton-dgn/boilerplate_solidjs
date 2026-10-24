/* oxlint-disable unicorn/no-document-cookie -- Os testes exercitam a persistência e o bloqueio de cookie diretamente. */
import { page, userEvent } from 'vite-plus/test/browser/context'

import { THEME_COOKIE_NAME } from '@/constants/theme.ts'
import { readTheme } from '@/infra/adapters/themeStorage/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import '@/theme/globalStyles.css'

import { ThemeToggle } from '../index.tsx'

describe('seletor de tema', () => {
  beforeEach(() => {
    document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
    document.documentElement.toggleAttribute('data-js', true)
  })
  afterEach(() => {
    document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
    document.documentElement.toggleAttribute('data-js', false)
  })

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

  it('oculta o gatilho quando o documento não tem JavaScript', async () => {
    document.documentElement.toggleAttribute('data-js', false)
    const host = renderComponent(() => <ThemeToggle />)
    const trigger = host.querySelector('button')
    assert(trigger)
    await expect.element(trigger).not.toBeVisible()
    document.documentElement.toggleAttribute('data-js', true)
    await expect.element(trigger).toBeVisible()
  })
})
