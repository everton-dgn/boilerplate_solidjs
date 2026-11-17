import { m } from '@paraglide/messages.js'
import { createSignal, Show } from 'solid-js'
import { page, userEvent } from 'vite-plus/test/browser/context'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import '@/theme/globalStyles.css'

import { Dialog } from '../index.tsx'

type MountOptions = {
  isInitiallyOpen?: boolean
  shouldAcceptClose?: boolean
}

function mountDialog(options: MountOptions = {}) {
  const onChange = vi.fn<(open: boolean) => void>()
  let changeOpen!: (open: boolean) => void
  let remove!: () => void
  const host = renderComponent(
    () => {
      const [isOpen, setIsOpen] = createSignal(options.isInitiallyOpen ?? false)
      const [isMounted, setIsMounted] = createSignal(true)
      changeOpen = value => {
        setIsOpen(value)
      }
      remove = () => {
        setIsMounted(false)
      }
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open
          </button>
          <button type="button">Fora</button>
          <Show when={isMounted()}>
            <Dialog
              open={isOpen()}
              onOpenChange={value => {
                onChange(value)
                if (options.shouldAcceptClose !== false) setIsOpen(value)
              }}
              title="Preferences"
              description="Choose your preferences."
            >
              <input aria-label="Nome" />
              <form method="dialog">
                <button type="submit">Save</button>
              </form>
            </Dialog>
          </Show>
        </>
      )
    },
    { hasProviders: false }
  )
  const dialog = host.querySelector('dialog')
  if (!dialog) throw new Error('Dialog not mounted')
  return { dialog, onChange, changeOpen, remove }
}

describe('dialog in the browser', () => {
  it('opens a modal on click, names the content and blocks outside focus', async () => {
    const { dialog, onChange } = mountDialog()
    expect(dialog.open).toBe(false)
    await page.getByRole('button', { name: 'Open' }).click()
    expect(dialog.matches(':modal')).toBe(true)
    await expect
      .element(page.getByRole('dialog', { name: 'Preferences' }))
      .toHaveAccessibleDescription('Choose your preferences.')
    await expect
      .element(page.getByRole('button', { name: m.dialog_close() }))
      .toHaveFocus()
    page.getByText('Fora', { exact: true }).element().focus()
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps Tab inside the modal and restores the focus with Escape', async () => {
    const { dialog, onChange } = mountDialog()
    const opener = page.getByRole('button', { name: 'Open' })
    await opener.click()
    await userEvent.keyboard('{Tab}')
    await expect
      .element(page.getByRole('textbox', { name: 'Nome' }))
      .toHaveFocus()
    await userEvent.keyboard('{Tab}')
    await expect
      .element(page.getByRole('button', { name: 'Save' }))
      .toHaveFocus()
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    await expect
      .element(page.getByRole('textbox', { name: 'Nome' }))
      .toHaveFocus()
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    await expect
      .element(page.getByRole('button', { name: m.dialog_close() }))
      .toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => dialog.open).toBe(false)
    await expect.element(opener).toHaveFocus()
    expect(onChange.mock.calls).toStrictEqual([[false]])
  })

  it('syncs external changes and closes through the button without a duplicated callback', async () => {
    const { dialog, onChange, changeOpen } = mountDialog()
    changeOpen(true)
    await expect.poll(() => dialog.matches(':modal')).toBe(true)
    changeOpen(false)
    await expect.poll(() => dialog.open).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
    await page.getByRole('button', { name: 'Open' }).click()
    await page.getByRole('button', { name: m.dialog_close() }).click()
    await expect.poll(() => dialog.open).toBe(false)
    expect(onChange.mock.calls).toStrictEqual([[false]])
  })

  it('syncs the native closing through method=dialog', async () => {
    const { dialog, onChange } = mountDialog()
    const opener = page.getByRole('button', { name: 'Open' })
    await opener.click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => onChange.mock.calls).toStrictEqual([[false]])
    expect(dialog.open).toBe(false)
    await expect.element(opener).toHaveFocus()
    await opener.click()
    expect(dialog.matches(':modal')).toBe(true)
  })

  it('keeps the controlled state when the consumer refuses to close', async () => {
    const { dialog, onChange } = mountDialog({
      isInitiallyOpen: true,
      shouldAcceptClose: false
    })
    await expect.poll(() => dialog.matches(':modal')).toBe(true)
    await userEvent.keyboard('{Escape}')
    expect(dialog.matches(':modal')).toBe(true)
    await page.getByRole('button', { name: m.dialog_close() }).click()
    expect(dialog.matches(':modal')).toBe(true)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect
      .poll(() => onChange.mock.calls)
      .toStrictEqual([[false], [false], [false]])
    await expect.poll(() => dialog.matches(':modal')).toBe(true)
  })

  it('opens with an initial open and removes the modality on disposal', async () => {
    const { dialog, onChange, remove } = mountDialog({ isInitiallyOpen: true })
    await expect.poll(() => dialog.matches(':modal')).toBe(true)
    remove()
    await expect.poll(() => dialog.isConnected).toBe(false)
    expect(dialog.open).toBe(false)
    const outside = page.getByRole('button', { name: 'Fora' })
    await outside.click()
    await expect.element(outside).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('restores the focus when disposing a modal opened by the trigger', async () => {
    const { dialog, remove } = mountDialog()
    const opener = page.getByRole('button', { name: 'Open' })
    await opener.click()
    remove()
    await expect.poll(() => dialog.isConnected).toBe(false)
    await expect.element(opener).toHaveFocus()
  })

  it('does not close on the backdrop and leaves out a missing description', async () => {
    const host = renderComponent(
      () => (
        <Dialog
          open
          title="Aviso"
          onOpenChange={vi.fn<(open: boolean) => void>()}
        >
          <p>Content</p>
        </Dialog>
      ),
      { hasProviders: false }
    )
    const dialog = host.querySelector('dialog')
    await expect.poll(() => dialog?.matches(':modal')).toBe(true)
    await userEvent.click(document.body, { position: { x: 1, y: 1 } })
    expect(dialog?.matches(':modal')).toBe(true)
    expect(dialog?.hasAttribute('aria-describedby')).toBe(false)
  })
})
