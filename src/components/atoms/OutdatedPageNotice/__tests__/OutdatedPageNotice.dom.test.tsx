import { m } from '@paraglide/messages.js'
import { render } from '@solidjs/web'
import { flush } from 'solid-js'

import { REFUSED_SUBMIT_EVENT } from '@/constants/outdated-page.ts'

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
  // O ouvinte entra no onSettled, que roda no flush seguinte à montagem.
  flush()
  return { host, dispose }
}

function reportRefusedSubmit(): void {
  globalThis.dispatchEvent(new Event(REFUSED_SUBMIT_EVENT))
  flush()
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

describe('aviso de página desatualizada', () => {
  it('aparece na recusa, fecha pelo botão e reaparece na próxima', () => {
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

  it('recarrega o documento só quando o usuário pede', () => {
    const reload = vi
      .spyOn(globalThis.location, 'reload')
      .mockImplementation(() => {
        /* Mantém este teste no próprio documento. */
      })
    const { host } = mountNotice()
    reportRefusedSubmit()
    expect(reload).not.toHaveBeenCalled()
    findButton({ host, name: m.outdatedPageNotice_reload() }).click()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('devolve o foco à origem quando o botão de fechar tinha o foco', () => {
    const { host } = mountNotice()
    const origin = document.createElement('button')
    document.body.append(origin)
    onTestFinished(() => origin.remove())
    reportRefusedSubmit()
    const dismiss = findButton({ host, name: m.outdatedPageNotice_dismiss() })
    dismiss.focus()
    // Fixa a origem sem depender de como o ambiente preenche relatedTarget.
    dismiss.dispatchEvent(
      new FocusEvent('focusin', { bubbles: true, relatedTarget: origin })
    )
    dismiss.click()
    flush()
    expect(document.activeElement).toBe(origin)
  })

  it('remove o ouvinte ao desmontar', () => {
    const removeListener = vi.spyOn(globalThis, 'removeEventListener')
    const { dispose } = mountNotice()
    dispose()
    expect(removeListener).toHaveBeenCalledWith(
      REFUSED_SUBMIT_EVENT,
      expect.any(Function)
    )
  })
})
