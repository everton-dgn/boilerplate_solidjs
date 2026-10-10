import { render } from '@solidjs/web'
import { flush } from 'solid-js'

import { m } from '@/paraglide/messages.js'

import { ToastProvider } from '../index.tsx'
import type { ToastApi } from '../types.ts'
import { useToast } from '../useToast/index.ts'

const SHORT_WAIT = 180
const ANNOUNCEMENT_WAIT = 220
const TWO_TOASTS = 2
const PERSISTENCE_WAIT = 5200
const PERSISTENCE_TIMEOUT = 10_000

function mountToast() {
  const host = document.createElement('div')
  document.body.append(host)
  let api: ToastApi | undefined
  function Probe() {
    api = useToast()
    return <button type="button">Outside</button>
  }
  let disposed = false
  const unmount = render(
    () => (
      <ToastProvider>
        <Probe />
      </ToastProvider>
    ),
    host
  )
  function dispose() {
    if (disposed) return
    disposed = true
    unmount()
    host.remove()
  }
  onTestFinished(dispose)
  assert(api)
  return { host, api, dispose }
}

function wait(milliseconds: number) {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  setTimeout(() => resolve(true), milliseconds)
  return promise
}

describe('notificações temporárias', () => {
  it('monta anúncios vazios, isola providers e renderiza texto seguro sem mover foco', () => {
    const first = mountToast()
    const second = mountToast()
    expect(
      Array.from(
        first.host.querySelectorAll('[aria-live]'),
        node => node.textContent
      )
    ).toStrictEqual(['', ''])
    const outside = first.host.querySelector('button')
    outside?.focus()
    const id = first.api.show({
      message: '<img src=x onerror=alert(1)>',
      duration: 0
    })
    flush()
    expect(first.host.querySelector('li p')).toHaveTextContent(
      '<img src=x onerror=alert(1)>'
    )
    expect(first.host.querySelectorAll('img, [style]')).toHaveLength(0)
    expect(second.host.querySelectorAll('li')).toHaveLength(0)
    expect(document.activeElement).toBe(outside)
    first.api.dismiss(id)
  })

  it('compõe chamadas no mesmo tick e limita a lista aos cinco mais recentes', () => {
    const { host, api } = mountToast()
    const ids = Array.from({ length: 8 }, (_, index) =>
      api.show({ message: `Item ${index}`, duration: 0 })
    )
    const middleIndex = 4
    const oldest = ids.at(0)
    const middle = ids.at(middleIndex)
    const lastIndex = -1
    const newest = ids.at(lastIndex)
    assert(oldest && middle && newest)
    api.update({ id: newest, message: 'Updated', variant: 'success' })
    api.dismiss(middle)
    flush()
    expect(
      Array.from(host.querySelectorAll('li p'), item => item.textContent)
    ).toStrictEqual(['Item 3', 'Item 5', 'Item 6', 'Updated'])
    api.update({ id: oldest, message: 'Removed' })
    flush()
    expect(host).not.toHaveTextContent('Removed')
  })

  it(
    'mantém loading e duração zero, atualiza o mesmo nó e expira após atualização',
    async () => {
      const { host, api } = mountToast()
      const id = api.show({ message: 'Working', variant: 'loading' })
      api.show({ message: 'Persistent', duration: 0 })
      api.show({ message: 'Default expiry' })
      api.update({ id, message: 'Still working' })
      flush()
      const item = host.querySelector('li')
      await wait(PERSISTENCE_WAIT)
      expect(host.querySelectorAll('li')).toHaveLength(TWO_TOASTS)
      api.update({ id, message: 'Finished', variant: 'success', duration: 100 })
      flush()
      expect(host.querySelector('li')).toBe(item)
      expect(item).toHaveTextContent('Finished')
      await expect.poll(() => host.querySelectorAll('li').length).toBe(1)
      expect(host.querySelector('li')).toHaveTextContent('Persistent')
    },
    PERSISTENCE_TIMEOUT
  )

  it('pausa por hover e foco juntos e retoma somente ao sair dos dois', async () => {
    const { host, api } = mountToast()
    api.show({ message: 'Paused', duration: 120 })
    flush()
    const item = host.querySelector('li')
    const close = item?.querySelector('button')
    assert(item && close)
    item.dispatchEvent(new PointerEvent('pointerenter'))
    close.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await wait(SHORT_WAIT)
    item.dispatchEvent(new PointerEvent('pointerleave'))
    await wait(SHORT_WAIT)
    expect(item.isConnected).toBe(true)
    close.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: host })
    )
    await expect.poll(() => host.querySelector('li')).toBeNull()
  })

  it('suspende timers em aba oculta, inclusive quando atualizados', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    onTestFinished(() => hidden.mockRestore())
    const { host, api } = mountToast()
    const id = api.show({ message: 'Hidden', duration: 100 })
    api.update({ id, duration: 120 })
    flush()
    await wait(SHORT_WAIT)
    expect(host.querySelector('li')).not.toBeNull()
    hidden.mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await expect.poll(() => host.querySelector('li')).toBeNull()
  })

  it('anuncia a última atualização por prioridade e suprime repetição consecutiva', async () => {
    const { host, api } = mountToast()
    const id = api.show({ message: 'First', duration: 0 })
    api.update({ id, message: 'Latest' })
    api.show({ message: 'Failure', variant: 'error', duration: 0 })
    await expect
      .poll(() => host.querySelector('output')?.textContent)
      .toBe(`${m.toast_info()}: Latest`)
    expect(host.querySelector('[role="alert"]')).toHaveTextContent(
      `${m.toast_error()}: Failure`
    )
    const changes = vi.fn<MutationCallback>()
    const observer = new MutationObserver(changes)
    const output = host.querySelector('output')
    assert(output)
    observer.observe(output, {
      childList: true,
      subtree: true,
      characterData: true
    })
    onTestFinished(() => observer.disconnect())
    api.update({ id, message: 'Latest' })
    await wait(ANNOUNCEMENT_WAIT)
    expect(changes).not.toHaveBeenCalled()
    api.dismiss(id)
  })

  it.each([
    { variant: 'success', dismissFirst: true },
    { variant: 'success', dismissFirst: false },
    { variant: 'error', dismissFirst: true },
    { variant: 'error', dismissFirst: false }
  ] as const)(
    'reanuncia toast independente com texto igual: $variant, dismiss=$dismissFirst',
    async ({ variant, dismissFirst }) => {
      const { host, api } = mountToast()
      const region = host.querySelector(
        variant === 'error' ? '[role="alert"]' : 'output'
      )
      assert(region)
      const id = api.show({ message: 'Saved', variant, duration: 0 })
      await expect.poll(() => region.textContent).toContain('Saved')
      const previousText = region.textContent
      if (dismissFirst) api.dismiss(id)
      api.show({ message: 'Saved', variant, duration: 0 })
      flush()
      expect(region.textContent).toBe('')
      await expect.poll(() => region.textContent).toBe(previousText)
    }
  )

  it('não anuncia toast removido ou a prioridade anterior de uma atualização', async () => {
    const { host, api } = mountToast()
    const removed = api.show({ message: 'Removed', duration: 0 })
    api.dismiss(removed)
    const changed = api.show({ message: 'Changed', duration: 0 })
    api.update({ id: changed, variant: 'error' })
    await wait(ANNOUNCEMENT_WAIT)
    expect(host.querySelector('output')).toHaveTextContent('')
    expect(host.querySelector('[role="alert"]')).toHaveTextContent(
      `${m.toast_error()}: Changed`
    )
  })

  it('cancela timers e listener no descarte e ignora a API retida', () => {
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    onTestFinished(() => {
      timers.mockRestore()
      clear.mockRestore()
      add.mockRestore()
      remove.mockRestore()
    })
    const { api, dispose, host } = mountToast()
    const id = api.show({ message: 'Dispose', duration: 1000 })
    const scheduled = timers.mock.results.map(result => {
      const value: unknown = result.value
      return value
    })
    const visibility = add.mock.calls.find(
      ([name]) => name === 'visibilitychange'
    )?.[1]
    dispose()
    for (const timer of scheduled) expect(clear).toHaveBeenCalledWith(timer)
    expect(remove).toHaveBeenCalledWith('visibilitychange', visibility)
    const count = timers.mock.calls.length
    api.show({ message: 'Late' })
    api.update({ id, duration: 100 })
    api.dismiss(id)
    expect(timers).toHaveBeenCalledTimes(count)
    expect(host.isConnected).toBe(false)
  })
})
