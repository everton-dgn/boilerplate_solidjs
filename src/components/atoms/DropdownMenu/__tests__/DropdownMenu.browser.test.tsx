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
      trigger={props => <Button {...props} label="Open" />}
    />
  ))

  return { host, onChange }
}

describe('dropdown menu in the browser', () => {
  it('exposes the accessible state and toggles through the trigger', async () => {
    mountMenu()
    const opener = page.getByRole('button', { name: 'Open' })
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

  it('moves to the ends with arrows, Home and End', async () => {
    mountMenu()
    const opener = page.getByRole('button', { name: 'Open' })
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

  it('closes with Tab and with an outside click keeping the target of the focus', async () => {
    const { host } = mountMenu()
    renderComponent(() => (
      <div style={{ 'margin-top': '200px' }}>
        <Button label="Next" />
      </div>
    ))
    const opener = page.getByRole('button', { name: 'Open' })
    const next = page.getByRole('button', { name: 'Next' })
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

  it('ignores a disabled item in selection and navigation', async () => {
    const onChange = vi.fn<(value: string) => void>()
    const host = renderComponent(() => (
      <DropdownMenu
        label="Tema"
        items={[
          { value: 'light', label: 'Claro' },
          { value: 'dark', label: 'Escuro', disabled: true }
        ]}
        onChange={onChange}
        trigger={props => <Button {...props} label="Open" />}
      />
    ))

    await page.getByRole('button', { name: 'Open' }).click()
    // Dispatches directly because browser automation refuses disabled targets.
    host.querySelector<HTMLElement>('[aria-disabled="true"]')?.click()
    expect(onChange).not.toHaveBeenCalled()
    await expect.element(page.getByRole('menu')).toBeVisible()
    await userEvent.keyboard('{ArrowDown}')
    await expect
      .element(page.getByRole('menuitemradio', { name: 'Claro' }))
      .toHaveFocus()
  })

  it.each([
    { name: 'empty', items: [] },
    {
      name: 'disabled',
      items: [{ value: 'dark', label: 'Escuro', disabled: true }]
    }
  ])('closes the $name menu with Escape and Tab', async ({ items }) => {
    renderComponent(() => (
      <>
        <DropdownMenu
          label="Tema"
          items={items}
          trigger={props => <Button {...props} label="Open" />}
        />
        <Button label="Next" />
      </>
    ))

    const opener = page.getByRole('button', { name: 'Open' })
    await opener.click()
    await expect.element(page.getByRole('menu')).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
    await expect.element(opener).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Tab}')
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
    await expect
      .element(page.getByRole('button', { name: 'Next' }))
      .toHaveFocus()
  })

  it.each(['{Enter}', ' '])('navigates and selects with %s', async key => {
    const { onChange } = mountMenu()

    await userEvent.keyboard('{Tab}')
    await userEvent.keyboard('{ArrowDown}')

    await expect
      .element(page.getByRole('menuitemradio', { name: 'Claro' }))
      .toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard(key)

    expect(onChange).toHaveBeenCalledWith('dark')
    const opener = page.getByRole('button', { name: 'Open' })
    await expect.element(opener).toHaveFocus()
    expect(opener.element().matches(':focus-visible')).toBe(true)
  })

  it('returns the focus to the trigger without a visible ring after a pointer selection', async () => {
    const { onChange } = mountMenu()
    const opener = page.getByRole('button', { name: 'Open' })

    await opener.click()
    await page.getByRole('menuitemradio', { name: 'Escuro' }).click()
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
    await expect.element(opener).toHaveFocus()
    expect(opener.element().matches(':focus-visible')).toBe(false)

    await opener.click()
    await userEvent.keyboard('{Enter}')

    expect(onChange.mock.calls).toStrictEqual([['dark'], ['light']])
    await expect.element(opener).toHaveFocus()
  })

  it('shows the focus ring on the item only in keyboard navigation', async () => {
    mountMenu()
    const opener = page.getByRole('button', { name: 'Open' })
    const first = page.getByRole('menuitemradio', { name: 'Claro' })

    await opener.click()
    await expect.element(first).toHaveFocus()
    expect(first.element().matches(':focus-visible')).toBe(false)
    expect(getComputedStyle(first.element()).outlineStyle).toBe('none')

    await userEvent.keyboard('{Escape}')
    await userEvent.keyboard('{ArrowDown}')
    await expect.element(first).toHaveFocus()
    expect(first.element().matches(':focus-visible')).toBe(true)
    expect(getComputedStyle(first.element())).toMatchObject({
      outlineStyle: 'solid',
      outlineOffset: '-2px'
    })
  })
})
