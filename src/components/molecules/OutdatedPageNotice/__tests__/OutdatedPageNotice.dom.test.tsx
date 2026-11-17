import { m } from '@paraglide/messages.js'
import { render } from '@solidjs/web'
import { flush } from 'solid-js'

import {
  OUTDATED_FALLBACK_EVENT,
  REFUSED_SUBMIT_EVENT
} from '@/constants/outdated-page.ts'

import { OutdatedPageNotice } from '../index.tsx'

type MountedNotice = { host: HTMLDivElement; dispose: () => void }
type ButtonQuery = { host: HTMLElement; name: string }

function mountNotice(): MountedNotice {
  const host = document.createElement('div')
  document.body.append(host)
  const unmount = render(() => <OutdatedPageNotice />, host)
  let isDisposed = false
  function dispose(): void {
    if (isDisposed) return
    isDisposed = true
    unmount()
    host.remove()
  }
  onTestFinished(dispose)
  // The listener enters in onSettled, which runs on the flush after mounting.
  flush()
  return { host, dispose }
}

function reportRefusedSubmit(): void {
  globalThis.dispatchEvent(new Event(REFUSED_SUBMIT_EVENT))
  flush()
}

function reportOutdatedFallback(): void {
  globalThis.dispatchEvent(new Event(OUTDATED_FALLBACK_EVENT))
  flush()
}

function readTitle(host: HTMLElement): string | null | undefined {
  const titleId = host.querySelector('section')?.getAttribute('aria-labelledby')
  assert(titleId)
  return document.querySelector(`#${titleId}`)?.textContent
}

function findButton({ host, name }: ButtonQuery): HTMLButtonElement {
  const button = [...host.querySelectorAll('button')].find(
    candidate =>
      candidate.textContent === name ||
      candidate.getAttribute('aria-label') === name
  )
  assert(button)
  return button
}

describe('outdated page notice', () => {
  it('appears on the refusal, closes through the button and appears again on the next one', () => {
    const { host } = mountNotice()
    expect(host.querySelector('section')).toBeNull()
    reportRefusedSubmit()
    expect(host.querySelector('[role="alert"]')).toHaveTextContent(
      m.outdatedPageNotice_description()
    )
    findButton({ host, name: m.outdatedPageNotice_dismiss() }).click()
    flush()
    expect(host.querySelector('section')).toBeNull()
    reportRefusedSubmit()
    const section = host.querySelector('section')
    const titleId = section?.getAttribute('aria-labelledby')
    assert(titleId)
    expect(document.querySelector(`#${titleId}`)).toHaveTextContent(
      m.outdatedPageNotice_title()
    )
  })

  it('reloads the document only when the user asks', () => {
    const reload = vi
      .spyOn(globalThis.location, 'reload')
      .mockImplementation(() => {
        /* Keeps this test in its own document. */
      })
    const { host } = mountNotice()
    reportRefusedSubmit()
    expect(reload).not.toHaveBeenCalled()
    findButton({ host, name: m.outdatedPageNotice_reload() }).click()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('returns the focus to the origin when the close button had the focus', () => {
    const { host } = mountNotice()
    const origin = document.createElement('button')
    document.body.append(origin)
    onTestFinished(() => origin.remove())
    reportRefusedSubmit()
    const dismiss = findButton({ host, name: m.outdatedPageNotice_dismiss() })
    dismiss.focus()
    // Pins the origin without depending on how the environment fills relatedTarget.
    dismiss.dispatchEvent(
      new FocusEvent('focusin', { bubbles: true, relatedTarget: origin })
    )
    dismiss.click()
    flush()
    expect(document.activeElement).toBe(origin)
  })

  it('warns that part of the page did not load and opens again after being closed', () => {
    const { host } = mountNotice()
    reportOutdatedFallback()
    expect(readTitle(host)).toBe(m.outdatedPageNotice_fallbackTitle())
    expect(host.querySelector('[role="alert"]')).toHaveTextContent(
      m.outdatedPageNotice_fallbackDescription()
    )
    findButton({ host, name: m.outdatedPageNotice_dismiss() }).click()
    flush()
    expect(host.querySelector('section')).toBeNull()
    reportOutdatedFallback()
    expect(readTitle(host)).toBe(m.outdatedPageNotice_fallbackTitle())
  })

  it('replaces the notice for part of the page with the submission one', () => {
    const { host } = mountNotice()
    reportOutdatedFallback()
    reportRefusedSubmit()
    expect(readTitle(host)).toBe(m.outdatedPageNotice_title())
  })

  it('keeps the submission notice when another part of the page fails', () => {
    const { host } = mountNotice()
    reportRefusedSubmit()
    reportOutdatedFallback()
    expect(readTitle(host)).toBe(m.outdatedPageNotice_title())
  })

  it('removes both listeners on unmount', () => {
    const addListener = vi.spyOn(globalThis, 'addEventListener')
    const removeListener = vi.spyOn(globalThis, 'removeEventListener')
    const { dispose } = mountNotice()
    dispose()
    for (const type of [REFUSED_SUBMIT_EVENT, OUTDATED_FALLBACK_EVENT]) {
      const registrations = addListener.mock.calls.filter(
        ([event]) => event === type
      )
      expect(registrations).toHaveLength(1)
      const listener = registrations[0]?.[1]
      assert(listener)
      expect(removeListener).toHaveBeenCalledWith(type, listener)
    }
  })
})
