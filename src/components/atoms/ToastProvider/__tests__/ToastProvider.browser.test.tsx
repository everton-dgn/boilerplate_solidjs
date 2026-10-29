import { m } from '@paraglide/messages.js'
import { page, userEvent } from 'vite-plus/test/browser/context'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { ToastProvider } from '../index.tsx'
import type { ToastApi } from '../types.ts'
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

function PairTrigger() {
  const toast = useToast()
  return (
    <button
      type="button"
      onClick={() => {
        toast.show({ message: 'First toast', duration: 0 })
        toast.show({ message: 'Second toast', duration: 0 })
      }}
    >
      Show toasts
    </button>
  )
}

describe('notificações no navegador', () => {
  it('preserva foco ao aparecer, pausa com foco e fecha pelo teclado', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    onTestFinished(() => {
      vi.useRealTimers()
    })
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
    await vi.advanceTimersByTimeAsync(FOCUS_WAIT)
    await expect.element(close).toBeVisible()
    await userEvent.keyboard('{Enter}')
    await expect.element(close).not.toBeInTheDocument()
    await expect.element(trigger).toHaveFocus()
  })

  it('move o foco para o vizinho e depois para a origem ao fechar pelo teclado', async () => {
    renderComponent(
      () => (
        <ToastProvider>
          <PairTrigger />
        </ToastProvider>
      ),
      { providers: false }
    )
    const trigger = page.getByRole('button', { name: 'Show toasts' })
    await userEvent.click(trigger)
    const items = page.getByRole('listitem')
    await expect.element(items.nth(1)).toMatchTextContent('Second toast')
    await userEvent.keyboard('{Tab}')
    await expect
      .element(items.nth(0).getByRole('button', { name: m.toast_close() }))
      .toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect.element(items).toMatchTextContent('Second toast')
    await expect
      .element(items.getByRole('button', { name: m.toast_close() }))
      .toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect.element(items).not.toBeInTheDocument()
    await expect.element(trigger).toHaveFocus()
  })

  it.each([
    { order: 'focado primeiro', isFocusedFirst: true },
    { order: 'vizinho primeiro', isFocusedFirst: false }
  ])(
    'devolve o foco à origem quando os dois saem no mesmo tick: $order',
    async ({ isFocusedFirst }) => {
      let api: ToastApi | undefined
      const ids: string[] = []
      function Probe() {
        const toast = useToast()
        api = toast
        return (
          <button
            type="button"
            onClick={() => {
              ids.push(
                toast.show({ message: 'First toast', duration: 0 }),
                toast.show({ message: 'Second toast', duration: 0 })
              )
            }}
          >
            Show toasts
          </button>
        )
      }
      renderComponent(
        () => (
          <ToastProvider>
            <Probe />
          </ToastProvider>
        ),
        { providers: false }
      )
      const trigger = page.getByRole('button', { name: 'Show toasts' })
      await userEvent.click(trigger)
      const items = page.getByRole('listitem')
      await expect.element(items.nth(1)).toMatchTextContent('Second toast')
      await userEvent.keyboard('{Tab}')
      await expect
        .element(items.nth(0).getByRole('button', { name: m.toast_close() }))
        .toHaveFocus()
      const [focused, neighbor] = ids
      assert(api && focused && neighbor)
      const order = isFocusedFirst ? [focused, neighbor] : [neighbor, focused]
      for (const id of order) api.dismiss(id)
      await expect.element(items).not.toBeInTheDocument()
      await expect.element(trigger).toHaveFocus()
    }
  )
})
