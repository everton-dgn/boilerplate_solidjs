import { m } from '@paraglide/messages.js'
import { render } from '@solidjs/web'
import { flush } from 'solid-js'

import { ToastProvider } from '../index.tsx'
import type { ToastApi } from '../types.ts'
import { useToast } from '../useToast/index.ts'

const SHORT_WAIT = 180
const ANNOUNCEMENT_DELAY = 150
const ANNOUNCEMENT_WAIT = 220
const TWO_TOASTS = 2
const DEFAULT_DURATION = 5000
const MAX_TOASTS = 5
const SHORT_DURATION = 100
const PAUSED_DURATION = 120
const TEXT_DURATION = 200
const BEFORE_TEXT_UPDATE = 150
const AFTER_TEXT_UPDATE = 60

function mountToast() {
  const host = document.createElement('div')
  document.body.append(host)
  let api: ToastApi | undefined
  function Probe() {
    api = useToast()
    return <button type="button">Outside</button>
  }
  let isDisposed = false
  const unmount = render(
    () => (
      <ToastProvider>
        <Probe />
      </ToastProvider>
    ),
    host
  )
  function dispose() {
    if (isDisposed) return
    isDisposed = true
    unmount()
    host.remove()
  }
  onTestFinished(dispose)
  assert(api)
  return { host, api, dispose }
}

function useFakeClock() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  onTestFinished(() => {
    vi.useRealTimers()
  })
}

function advance(milliseconds: number) {
  vi.advanceTimersByTime(milliseconds)
  flush()
}

function readMessages(host: HTMLElement) {
  return Array.from(host.querySelectorAll('li p'), item => item.textContent)
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
    expect(readMessages(host)).toStrictEqual([
      'Item 3',
      'Item 5',
      'Item 6',
      'Updated'
    ])
    api.update({ id: oldest, message: 'Removed' })
    flush()
    expect(host).not.toHaveTextContent('Removed')
  })

  it('preserva na fila cheia as notificações com hover ou foco', () => {
    const { host, api } = mountToast()
    for (let index = 0; index < MAX_TOASTS; index += 1) {
      api.show({ message: `Item ${index}`, duration: 0 })
    }
    flush()
    const [hovered, focused] = host.querySelectorAll('li')
    const close = focused?.querySelector('button')
    assert(hovered && close)
    hovered.dispatchEvent(new PointerEvent('pointerenter'))
    close.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    api.show({ message: 'Newest', duration: 0 })
    flush()
    expect(readMessages(host)).toStrictEqual([
      'Item 0',
      'Item 1',
      'Item 3',
      'Item 4',
      'Newest'
    ])
  })

  it('mantém loading e duração zero, atualiza o mesmo nó e expira após atualização', () => {
    useFakeClock()
    const { host, api } = mountToast()
    const id = api.show({ message: 'Working', variant: 'loading' })
    api.show({ message: 'Persistent', duration: 0 })
    api.show({ message: 'Default expiry' })
    api.update({ id, message: 'Still working' })
    flush()
    const item = host.querySelector('li')
    advance(DEFAULT_DURATION)
    expect(host.querySelectorAll('li')).toHaveLength(TWO_TOASTS)
    api.update({
      id,
      message: 'Finished',
      variant: 'success',
      duration: SHORT_DURATION
    })
    flush()
    expect(host.querySelector('li')).toBe(item)
    expect(item).toHaveTextContent('Finished')
    advance(SHORT_DURATION)
    expect(readMessages(host)).toStrictEqual(['Persistent'])
  })

  it('preserva o prazo restante quando atualiza só o texto', () => {
    useFakeClock()
    const { host, api } = mountToast()
    const id = api.show({ message: 'Saving', duration: TEXT_DURATION })
    flush()
    advance(BEFORE_TEXT_UPDATE)
    api.update({ id, message: 'Almost saved' })
    flush()
    expect(readMessages(host)).toStrictEqual(['Almost saved'])
    advance(AFTER_TEXT_UPDATE)
    expect(host.querySelector('li')).toBeNull()
  })

  it('pausa por hover e foco juntos e retoma somente ao sair dos dois', () => {
    useFakeClock()
    const { host, api } = mountToast()
    api.show({ message: 'Paused', duration: PAUSED_DURATION })
    flush()
    const item = host.querySelector('li')
    const close = item?.querySelector('button')
    assert(item && close)
    item.dispatchEvent(new PointerEvent('pointerenter'))
    close.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    advance(SHORT_WAIT)
    item.dispatchEvent(new PointerEvent('pointerleave'))
    advance(SHORT_WAIT)
    expect(item.isConnected).toBe(true)
    close.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: host })
    )
    advance(PAUSED_DURATION)
    expect(host.querySelector('li')).toBeNull()
  })

  it('suspende timers em aba oculta, inclusive quando atualizados', () => {
    useFakeClock()
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    const { host, api } = mountToast()
    const id = api.show({ message: 'Hidden', duration: SHORT_DURATION })
    api.update({ id, duration: PAUSED_DURATION })
    flush()
    advance(SHORT_WAIT)
    expect(host.querySelector('li')).not.toBeNull()
    hidden.mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    advance(PAUSED_DURATION)
    expect(host.querySelector('li')).toBeNull()
  })
})

describe('anúncios das notificações', () => {
  it('anuncia a última atualização por prioridade e suprime repetição consecutiva', () => {
    useFakeClock()
    const { host, api } = mountToast()
    const id = api.show({ message: 'First', duration: 0 })
    api.update({ id, message: 'Latest' })
    api.show({ message: 'Failure', variant: 'error', duration: 0 })
    advance(ANNOUNCEMENT_DELAY)
    const output = host.querySelector('output')
    assert(output)
    expect(output).toHaveTextContent(`${m.toast_info()}: Latest`)
    expect(host.querySelector('[role="alert"]')).toHaveTextContent(
      `${m.toast_error()}: Failure`
    )
    const observer = new MutationObserver(() => {
      /* Os registros são lidos com takeRecords. */
    })
    observer.observe(output, {
      childList: true,
      subtree: true,
      characterData: true
    })
    onTestFinished(() => observer.disconnect())
    api.update({ id, message: 'Latest' })
    advance(ANNOUNCEMENT_WAIT)
    expect(observer.takeRecords()).toStrictEqual([])
    api.dismiss(id)
  })

  it('não reanuncia quando o texto volta ao último anúncio no mesmo lote', () => {
    useFakeClock()
    const { host, api } = mountToast()
    const id = api.show({ message: 'A', duration: 0 })
    advance(ANNOUNCEMENT_DELAY)
    const output = host.querySelector('output')
    assert(output)
    expect(output).toHaveTextContent(`${m.toast_info()}: A`)
    const observer = new MutationObserver(() => {
      /* Os registros são lidos com takeRecords. */
    })
    observer.observe(output, {
      childList: true,
      subtree: true,
      characterData: true
    })
    onTestFinished(() => observer.disconnect())
    api.update({ id, message: 'B' })
    api.update({ id, message: 'A' })
    advance(ANNOUNCEMENT_WAIT)
    expect(observer.takeRecords()).toStrictEqual([])
    expect(output).toHaveTextContent(`${m.toast_info()}: A`)
  })

  it.each([
    { variant: 'success', dismissFirst: true },
    { variant: 'success', dismissFirst: false },
    { variant: 'error', dismissFirst: true },
    { variant: 'error', dismissFirst: false }
  ] as const)(
    'reanuncia toast independente com texto igual: $variant, dismiss=$dismissFirst',
    ({ variant, dismissFirst }) => {
      useFakeClock()
      const { host, api } = mountToast()
      const region = host.querySelector(
        variant === 'error' ? '[role="alert"]' : 'output'
      )
      assert(region)
      const id = api.show({ message: 'Saved', variant, duration: 0 })
      advance(ANNOUNCEMENT_DELAY)
      expect(region.textContent).toContain('Saved')
      const previousText = region.textContent
      if (dismissFirst) api.dismiss(id)
      api.show({ message: 'Saved', variant, duration: 0 })
      flush()
      expect(region.textContent).toBe('')
      advance(ANNOUNCEMENT_DELAY)
      expect(region.textContent).toBe(previousText)
    }
  )

  it('não anuncia toast removido ou a prioridade anterior de uma atualização', () => {
    useFakeClock()
    const { host, api } = mountToast()
    const removed = api.show({ message: 'Removed', duration: 0 })
    api.dismiss(removed)
    const changed = api.show({ message: 'Changed', duration: 0 })
    api.update({ id: changed, variant: 'error' })
    advance(ANNOUNCEMENT_WAIT)
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
