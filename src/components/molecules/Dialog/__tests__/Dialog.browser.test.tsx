import { createSignal, Show } from 'solid-js'
import { page, userEvent } from 'vite-plus/test/browser/context'

import { m } from '@/paraglide/messages.js'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import '@/theme/globalStyles.css'

import { Dialog } from '../index.tsx'

type MountOptions = {
  initialOpen?: boolean
  acceptClose?: boolean
}

function mountDialog(options: MountOptions = {}) {
  const onChange = vi.fn<(open: boolean) => void>()
  let changeOpen!: (open: boolean) => void
  let remove!: () => void
  const host = renderComponent(
    () => {
      const [open, setOpen] = createSignal(options.initialOpen ?? false)
      const [mounted, setMounted] = createSignal(true)
      changeOpen = value => {
        setOpen(value)
      }
      remove = () => {
        setMounted(false)
      }
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir
          </button>
          <button type="button">Fora</button>
          <Show when={mounted()}>
            <Dialog
              open={open()}
              onOpenChange={value => {
                onChange(value)
                if (options.acceptClose !== false) setOpen(value)
              }}
              title="Preferências"
              description="Escolha suas preferências."
            >
              <input aria-label="Nome" />
              <form method="dialog">
                <button type="submit">Salvar</button>
              </form>
            </Dialog>
          </Show>
        </>
      )
    },
    { providers: false }
  )
  const dialog = host.querySelector('dialog')
  if (!dialog) throw new Error('Dialog não montado')
  return { dialog, onChange, changeOpen, remove }
}

describe('dialog no navegador', () => {
  it('abre modal no clique, nomeia o conteúdo e impede foco externo', async () => {
    const { dialog, onChange } = mountDialog()
    expect(dialog.open).toBe(false)
    await page.getByRole('button', { name: 'Abrir' }).click()
    expect(dialog.matches(':modal')).toBe(true)
    await expect
      .element(page.getByRole('dialog', { name: 'Preferências' }))
      .toHaveAccessibleDescription('Escolha suas preferências.')
    await expect
      .element(page.getByRole('button', { name: m.dialog_close() }))
      .toHaveFocus()
    page.getByText('Fora', { exact: true }).element().focus()
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('mantém Tab dentro do modal e restaura foco com Escape', async () => {
    const { dialog, onChange } = mountDialog()
    const opener = page.getByRole('button', { name: 'Abrir' })
    await opener.click()
    await userEvent.keyboard('{Tab}')
    await expect
      .element(page.getByRole('textbox', { name: 'Nome' }))
      .toHaveFocus()
    await userEvent.keyboard('{Tab}')
    await expect
      .element(page.getByRole('button', { name: 'Salvar' }))
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

  it('sincroniza mudanças externas e fecha pelo botão sem callback duplicado', async () => {
    const { dialog, onChange, changeOpen } = mountDialog()
    changeOpen(true)
    await expect.poll(() => dialog.matches(':modal')).toBe(true)
    changeOpen(false)
    await expect.poll(() => dialog.open).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
    await page.getByRole('button', { name: 'Abrir' }).click()
    await page.getByRole('button', { name: m.dialog_close() }).click()
    await expect.poll(() => dialog.open).toBe(false)
    expect(onChange.mock.calls).toStrictEqual([[false]])
  })

  it('sincroniza o fechamento nativo por method=dialog', async () => {
    const { dialog, onChange } = mountDialog()
    const opener = page.getByRole('button', { name: 'Abrir' })
    await opener.click()
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect.poll(() => onChange.mock.calls).toStrictEqual([[false]])
    expect(dialog.open).toBe(false)
    await expect.element(opener).toHaveFocus()
    await opener.click()
    expect(dialog.matches(':modal')).toBe(true)
  })

  it('mantém o estado controlado quando o consumidor recusa fechar', async () => {
    const { dialog, onChange } = mountDialog({
      initialOpen: true,
      acceptClose: false
    })
    await expect.poll(() => dialog.matches(':modal')).toBe(true)
    await userEvent.keyboard('{Escape}')
    expect(dialog.matches(':modal')).toBe(true)
    await page.getByRole('button', { name: m.dialog_close() }).click()
    expect(dialog.matches(':modal')).toBe(true)
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect
      .poll(() => onChange.mock.calls)
      .toStrictEqual([[false], [false], [false]])
    await expect.poll(() => dialog.matches(':modal')).toBe(true)
  })

  it('abre com open inicial e remove a modalidade ao descartar', async () => {
    const { dialog, onChange, remove } = mountDialog({ initialOpen: true })
    await expect.poll(() => dialog.matches(':modal')).toBe(true)
    remove()
    await expect.poll(() => dialog.isConnected).toBe(false)
    expect(dialog.open).toBe(false)
    const outside = page.getByRole('button', { name: 'Fora' })
    await outside.click()
    await expect.element(outside).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('restaura o foco ao descartar um modal aberto pelo gatilho', async () => {
    const { dialog, remove } = mountDialog()
    const opener = page.getByRole('button', { name: 'Abrir' })
    await opener.click()
    remove()
    await expect.poll(() => dialog.isConnected).toBe(false)
    await expect.element(opener).toHaveFocus()
  })

  it('não fecha no backdrop e omite descrição ausente', async () => {
    const host = renderComponent(
      () => (
        <Dialog
          open
          title="Aviso"
          onOpenChange={vi.fn<(open: boolean) => void>()}
        >
          <p>Conteúdo</p>
        </Dialog>
      ),
      { providers: false }
    )
    const dialog = host.querySelector('dialog')
    await expect.poll(() => dialog?.matches(':modal')).toBe(true)
    await userEvent.click(document.body, { position: { x: 1, y: 1 } })
    expect(dialog?.matches(':modal')).toBe(true)
    expect(dialog?.hasAttribute('aria-describedby')).toBe(false)
  })
})
