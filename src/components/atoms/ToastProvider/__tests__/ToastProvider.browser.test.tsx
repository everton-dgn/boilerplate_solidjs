import { page, userEvent } from 'vite-plus/test/browser/context'

import { m } from '@/paraglide/messages.js'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { ToastProvider } from '../index.tsx'
import { useToast } from '../useToast/index.ts'

const FOCUS_WAIT = 400

function Trigger() {
  const toast = useToast()
  return (
    <button
      type="button"
      onClick={() => toast.show({ message: 'Keyboard toast', duration: 250 })}
    >
      Show toast
    </button>
  )
}

describe('notificações no navegador', () => {
  it('preserva foco ao aparecer, pausa com foco e fecha pelo teclado', async () => {
    renderComponent(
      () => (
        <ToastProvider>
          <Trigger />
        </ToastProvider>
      ),
      { providers: false }
    )
    const trigger = page.getByRole('button', { name: 'Show toast' })
    await userEvent.click(trigger)
    await expect.element(trigger).toHaveFocus()
    await userEvent.keyboard('{Tab}')
    const close = page.getByRole('button', { name: m.toast_close() })
    await expect.element(close).toHaveFocus()
    const { promise, resolve } = Promise.withResolvers<boolean>()
    setTimeout(() => resolve(true), FOCUS_WAIT)
    await promise
    await expect.element(close).toBeVisible()
    await userEvent.keyboard('{Enter}')
    await expect.element(close).not.toBeInTheDocument()
  })
})
