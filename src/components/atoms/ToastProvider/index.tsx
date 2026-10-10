import { dynamicComponent } from '@solidjs/web'
import { For, type ParentProps, untrack } from 'solid-js'
import IconWarning from '~icons/hugeicons/alert-02'
import IconError from '~icons/hugeicons/alert-circle'
import IconClose from '~icons/hugeicons/cancel-01'
import IconSuccess from '~icons/hugeicons/checkmark-circle-02'
import IconInfo from '~icons/hugeicons/information-circle'
import IconLoading from '~icons/hugeicons/loader-circle'

import { m } from '@/paraglide/messages.js'

import { ToastContext } from './context.ts'
import { createToastState } from './createToastState/index.ts'
import type { ToastEntry, ToastVariant } from './types.ts'

import S from './styles.module.css'

const icons = {
  info: IconInfo,
  success: IconSuccess,
  warning: IconWarning,
  error: IconError,
  loading: IconLoading
}

function variantLabel(variant: ToastVariant) {
  const labels = {
    info: m.toast_info,
    success: m.toast_success,
    warning: m.toast_warning,
    error: m.toast_error,
    loading: m.toast_loading
  }
  return labels[variant]()
}

function announcement(toast: ToastEntry | undefined) {
  return toast ? `${variantLabel(toast.variant)}: ${toast.message}` : ''
}

export function ToastProvider(props: ParentProps) {
  const state = createToastState()

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
      <section class={S.viewport} aria-label={m.toast_notifications()}>
        <ol class={S.list}>
          <For each={state.toasts()} keyed={toast => toast.id}>
            {toast => {
              const id = untrack(() => toast().id)
              const Icon = dynamicComponent(() => icons[toast().variant])
              return (
                <li
                  class={[S.toast, S[`variant_${toast().variant}`]]}
                  onPointerEnter={() =>
                    state.pause({
                      id,
                      reason: 'hovered',
                      paused: true
                    })
                  }
                  onPointerLeave={() =>
                    state.pause({
                      id,
                      reason: 'hovered',
                      paused: false
                    })
                  }
                  onFocusIn={() =>
                    state.pause({
                      id,
                      reason: 'focused',
                      paused: true
                    })
                  }
                  onFocusOut={event => {
                    if (
                      !(event.relatedTarget instanceof Node) ||
                      !event.currentTarget.contains(event.relatedTarget)
                    ) {
                      state.pause({
                        id,
                        reason: 'focused',
                        paused: false
                      })
                    }
                  }}
                >
                  <span class={S.icon} aria-hidden="true">
                    <Icon width={20} height={20} />
                  </span>
                  <div class={S.content}>
                    <span class={S.label}>{variantLabel(toast().variant)}</span>
                    <p class={S.message}>{toast().message}</p>
                  </div>
                  <button
                    class={S.close}
                    type="button"
                    aria-label={m.toast_close()}
                    onClick={() => state.api.dismiss(id)}
                  >
                    <IconClose width={18} height={18} aria-hidden="true" />
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
