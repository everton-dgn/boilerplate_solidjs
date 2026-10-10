import type { JSX } from '@solidjs/web'
import {
  createEffect,
  createUniqueId,
  onCleanup,
  Show,
  untrack
} from 'solid-js'

import { Button } from '@/components/atoms/Button/index.tsx'
import { m } from '@/paraglide/messages.js'

import S from './styles.module.css'

type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: JSX.Element
  class?: string
}

// O backdrop não fecha o modal. Escape e o botão solicitam a mudança ao
// consumidor; um fechamento nativo (inclusive method="dialog") é reconciliado.
export function Dialog(props: DialogProps) {
  const id = createUniqueId()
  let element: HTMLDialogElement | undefined
  let opener: HTMLElement | undefined
  let disposed = false

  const synchronize = (open: boolean) => {
    if (!element || disposed) return
    if (open && !element.open) {
      const active = document.activeElement
      if (active instanceof HTMLElement && !element.contains(active)) {
        opener = active
      }
      element.showModal()
    } else if (!open && element.open) {
      element.close()
    }
  }

  createEffect(() => props.open, synchronize)

  onCleanup(() => {
    disposed = true
    if (!element?.open) return
    element.close()
    if (opener?.isConnected) opener.focus()
  })

  const handleClose = () => {
    // close é assíncrono: uma notificação antiga não pode fechar a reabertura.
    if (disposed || element?.open || !props.open) return
    props.onOpenChange(false)
    // O consumidor pode recusar o fechamento. Espere a publicação do signal
    // antes de repor a modalidade quando open continuar true.
    queueMicrotask(() => synchronize(untrack(() => props.open)))
  }

  return (
    <dialog
      ref={value => {
        element = value
      }}
      class={[S.dialog, props.class]}
      closedby="closerequest"
      aria-labelledby={`${id}-title`}
      aria-describedby={props.description ? `${id}-description` : undefined}
      onCancel={event => {
        event.preventDefault()
        props.onOpenChange(false)
      }}
      onClose={handleClose}
    >
      <header class={S.header}>
        <h2 id={`${id}-title`} class={S.title}>
          {props.title}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => props.onOpenChange(false)}
        >
          {m.dialog_close()}
        </Button>
      </header>
      <Show when={props.description}>
        <p id={`${id}-description`} class={S.description}>
          {props.description}
        </p>
      </Show>
      {props.children}
    </dialog>
  )
}
