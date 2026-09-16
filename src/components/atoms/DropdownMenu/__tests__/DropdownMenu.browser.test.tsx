import { page, userEvent } from 'vite-plus/test/browser/context'

import { Button } from '@/components/atoms/Button/index.tsx'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import '@/theme/globalStyles.css'

import { DropdownMenu } from '../index.tsx'

const ITEMS = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' }
] as const

function mountMenu(onChange = vi.fn<(value: string) => void>()) {
  const host = renderComponent(() => (
    <DropdownMenu
      label="Tema"
      items={ITEMS}
      value="light"
      onChange={onChange}
      trigger={props => <Button {...props} label="Abrir" />}
    />
  ))

  return { host, onChange }
}

describe('menu suspenso no navegador', () => {
  it('expõe o estado acessível e alterna pelo gatilho', async () => {
    mountMenu()
    const opener = page.getByRole('button', { name: 'Abrir' })
    const menu = page.getByRole('menu', { name: 'Tema' })

    await expect.element(opener).toHaveAttribute('aria-expanded', 'false')
    await expect.element(opener).not.toHaveAttribute('aria-controls')
    await expect.element(menu).not.toBeInTheDocument()

    await opener.click()
    await expect.element(opener).toHaveAttribute('aria-expanded', 'true')
    await expect.element(opener).toHaveAttribute('aria-controls')
    await expect.element(menu).toBeVisible()
    await expect
      .element(page.getByRole('menuitemradio', { name: 'Claro' }))
      .toHaveAttribute('aria-checked', 'true')
    await expect
      .element(page.getByRole('menuitemradio', { name: 'Escuro' }))
      .toHaveAttribute('aria-checked', 'false')

    await opener.click()
    await expect.element(menu).not.toBeInTheDocument()
  })

  it('navega pelas pontas com setas, Home e End', async () => {
    mountMenu()
    const opener = page.getByRole('button', { name: 'Abrir' })
    const first = page.getByRole('menuitemradio', { name: 'Claro' })
    const last = page.getByRole('menuitemradio', { name: 'Escuro' })

    await userEvent.keyboard('{Tab}{ArrowUp}')
    await expect.element(last).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    await expect.element(first).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    await expect.element(last).toHaveFocus()
    await userEvent.keyboard('{Home}')
    await expect.element(first).toHaveFocus()
    await userEvent.keyboard('{End}')
    await expect.element(last).toHaveFocus()
    await userEvent.keyboard('a')
    await expect.element(last).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect.element(opener).toHaveFocus()
  })

  it('fecha com Tab e com clique fora preservando o destino do foco', async () => {
    const { host } = mountMenu()
    renderComponent(() => (
      <div style={{ 'margin-top': '200px' }}>
        <Button label="Próximo" />
      </div>
    ))
    const opener = page.getByRole('button', { name: 'Abrir' })
    const next = page.getByRole('button', { name: 'Próximo' })
    const menu = page.getByRole('menu')

    await opener.click()
    await userEvent.keyboard('{Tab}')
    await expect.element(menu).not.toBeInTheDocument()
    await expect.element(next).toHaveFocus()

    await opener.click()
    host
      .querySelector('[role="menu"]')
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await expect.element(menu).toBeVisible()
    await next.click()
    await expect.element(menu).not.toBeInTheDocument()
    await expect.element(next).toHaveFocus()
    await next.click()
    await expect.element(menu).not.toBeInTheDocument()
  })

  it('ignora item desabilitado na seleção e na navegação', async () => {
    const onChange = vi.fn<(value: string) => void>()
    const host = renderComponent(() => (
      <DropdownMenu
        label="Tema"
        items={[
          { value: 'light', label: 'Claro' },
          { value: 'dark', label: 'Escuro', disabled: true }
        ]}
        onChange={onChange}
        trigger={props => <Button {...props} label="Abrir" />}
      />
    ))

    await page.getByRole('button', { name: 'Abrir' }).click()
    // Dispara direto porque a automação do navegador recusa alvos desabilitados.
    host.querySelector<HTMLElement>('[aria-disabled="true"]')?.click()
    expect(onChange).not.toHaveBeenCalled()
    await expect.element(page.getByRole('menu')).toBeVisible()
    await userEvent.keyboard('{ArrowDown}')
    await expect
      .element(page.getByRole('menuitemradio', { name: 'Claro' }))
      .toHaveFocus()
  })

  it.each([
    { name: 'vazio', items: [] },
    {
      name: 'desabilitado',
      items: [{ value: 'dark', label: 'Escuro', disabled: true }]
    }
  ])('fecha o menu $name com Escape e Tab', async ({ items }) => {
    renderComponent(() => (
      <>
        <DropdownMenu
          label="Tema"
          items={items}
          trigger={props => <Button {...props} label="Abrir" />}
        />
        <Button label="Próximo" />
      </>
    ))

    const opener = page.getByRole('button', { name: 'Abrir' })
    await opener.click()
    await expect.element(page.getByRole('menu')).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
    await expect.element(opener).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Tab}')
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
    await expect
      .element(page.getByRole('button', { name: 'Próximo' }))
      .toHaveFocus()
  })

  it.each(['{Enter}', ' '])('navega e seleciona com %s', async key => {
    const { onChange } = mountMenu()

    await userEvent.keyboard('{Tab}')
    await userEvent.keyboard('{ArrowDown}')

    await expect
      .element(page.getByRole('menuitemradio', { name: 'Claro' }))
      .toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard(key)

    expect(onChange).toHaveBeenCalledWith('dark')
    await expect
      .element(page.getByRole('button', { name: 'Abrir' }))
      .toHaveFocus()
  })

  it('devolve o foco ao gatilho quando o teclado seleciona após o mouse', async () => {
    const { onChange } = mountMenu()
    const opener = page.getByRole('button', { name: 'Abrir' })

    await opener.click()
    await page.getByRole('menuitemradio', { name: 'Escuro' }).click()
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
    await expect.element(opener).not.toHaveFocus()

    await opener.click()
    await userEvent.keyboard('{Enter}')

    expect(onChange.mock.calls).toStrictEqual([['dark'], ['light']])
    await expect.element(opener).toHaveFocus()
  })

  it('fecha com Escape e devolve o foco ao gatilho', async () => {
    const { host } = mountMenu()

    await page.getByRole('button', { name: 'Abrir' }).click()
    await userEvent.keyboard('{Escape}')

    expect(host.querySelector('[role="menu"]')).toBeNull()
    await expect
      .element(page.getByRole('button', { name: 'Abrir' }))
      .toHaveFocus()
  })
})
