import { m } from '@paraglide/messages.js'
import { dynamicComponent, type JSX } from '@solidjs/web'
import { For, type ParentProps, untrack } from 'solid-js'
import IconWarning from '~icons/hugeicons/alert-02'
import IconError from '~icons/hugeicons/alert-circle'
import IconClose from '~icons/hugeicons/cancel-01'
import IconSuccess from '~icons/hugeicons/checkmark-circle-02'
import IconInfo from '~icons/hugeicons/information-circle'
import IconLoading from '~icons/hugeicons/loader-circle'

import { ToastContext } from './context.ts'
import { createToastState } from './createToastState/index.ts'
import type { ToastEntry } from './types.ts'

import S from './styles.module.css'

const VARIANTS = {
  info: { icon: IconInfo, label: m.toast_info },
  success: { icon: IconSuccess, label: m.toast_success },
  warning: { icon: IconWarning, label: m.toast_warning },
  error: { icon: IconError, label: m.toast_error },
  loading: { icon: IconLoading, label: m.toast_loading }
}

function announcement(toast: ToastEntry | undefined) {
  return toast ? `${VARIANTS[toast.variant].label()}: ${toast.message}` : ''
}

export function ToastProvider(props: ParentProps) {
  const items = new Map<string, HTMLLIElement>()
  let focusOrigin: HTMLElement | undefined

  // Até o Solid atualizar o DOM, os itens dispensados no mesmo tick continuam
  // como irmãos; só os que seguem em `items` podem receber o foco.
  function findNeighbor(item: Element) {
    const remaining = new Set<Element>(items.values())
    let next = item.nextElementSibling
    while (next && !remaining.has(next)) next = next.nextElementSibling
    let previous = item.previousElementSibling
    while (previous && !remaining.has(previous)) {
      previous = previous.previousElementSibling
    }
    return next ?? previous
  }

  // Sem este desvio, remover o item focado deixa o foco no body.
  function releaseFocus(id: string) {
    const item = items.get(id)
    items.delete(id)
    if (!item?.contains(document.activeElement)) return
    const close = findNeighbor(item)?.querySelector('button')
    if (close) {
      close.focus()
      return
    }
    if (focusOrigin?.isConnected) focusOrigin.focus()
  }

  const state = createToastState({ beforeRemove: releaseFocus })

  const rememberFocusOrigin: JSX.FocusEventHandler<
    HTMLElement,
    FocusEvent
  > = event => {
    const origin = event.relatedTarget
    if (origin instanceof Node && event.currentTarget.contains(origin)) return
    focusOrigin = origin instanceof HTMLElement ? origin : undefined
  }

  return (
    <ToastContext value={state.api}>
      {props.children}
      <output class={S.sr_only} aria-live="polite" aria-atomic="true">
        {announcement(state.polite())}
      </output>
      <div
        class={S.sr_only}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        {announcement(state.assertive())}
      </div>
      <section
        class={S.viewport}
        aria-label={m.toast_notifications()}
        onFocusIn={rememberFocusOrigin}
      >
        <ol class={S.list}>
          <For each={state.toasts()} keyed={toast => toast.id}>
            {toast => {
              const id = untrack(() => toast().id)
              const Icon = dynamicComponent(
                () => VARIANTS[toast().variant].icon
              )
              return (
                <li
                  ref={element => items.set(id, element)}
                  class={[S.toast, S[`variant_${toast().variant}`]]}
                  onPointerEnter={() =>
                    state.pause({
                      id,
                      reason: 'hover',
                      isPaused: true
                    })
                  }
                  onPointerLeave={() =>
                    state.pause({
                      id,
                      reason: 'hover',
                      isPaused: false
                    })
                  }
                  onFocusIn={() =>
                    state.pause({
                      id,
                      reason: 'focus',
                      isPaused: true
                    })
                  }
                  onFocusOut={event => {
                    if (
                      !(event.relatedTarget instanceof Node) ||
                      !event.currentTarget.contains(event.relatedTarget)
                    ) {
                      state.pause({
                        id,
                        reason: 'focus',
                        isPaused: false
                      })
                    }
                  }}
                >
                  <span class={S.icon}>
                    <Icon
                      width={20}
                      height={20}
                      class={
                        toast().variant === 'loading' ? 'spinner' : undefined
                      }
                    />
                  </span>
                  <div class={S.content}>
                    <span class={S.label}>
                      {VARIANTS[toast().variant].label()}
                    </span>
                    <p class={S.message}>{toast().message}</p>
                  </div>
                  <button
                    class={S.close}
                    type="button"
                    aria-label={m.toast_close()}
                    onClick={() => state.api.dismiss(id)}
                  >
                    <IconClose width={18} height={18} />
                  </button>
                </li>
              )
            }}
          </For>
        </ol>
      </section>
    </ToastContext>
  )
}
