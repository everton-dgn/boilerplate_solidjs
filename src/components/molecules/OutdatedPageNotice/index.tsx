import { m } from '@paraglide/messages.js'
import type { JSX } from '@solidjs/web'
import { createSignal, createUniqueId, onSettled, Show } from 'solid-js'
import IconWarning from '~icons/hugeicons/alert-02'
import IconClose from '~icons/hugeicons/cancel-01'

import { Button } from '@/components/atoms/Button/index.tsx'
import {
  OUTDATED_FALLBACK_EVENT,
  REFUSED_SUBMIT_EVENT
} from '@/constants/outdated-page.ts'
import { createFocusOriginHandler } from '@/helpers/createFocusOriginHandler/index.ts'

import S from './styles.module.css'

type NoticeKind = 'submit' | 'fallback'
type NoticeMessages = { title: () => string; description: () => string }

const NOTICE_MESSAGES = {
  submit: {
    title: m.outdatedPageNotice_title,
    description: m.outdatedPageNotice_description
  },
  fallback: {
    title: m.outdatedPageNotice_fallbackTitle,
    description: m.outdatedPageNotice_fallbackDescription
  }
} satisfies Record<NoticeKind, NoticeMessages>

export function OutdatedPageNotice() {
  const [noticeKind, setNoticeKind] = createSignal<NoticeKind>()
  const titleId = createUniqueId()
  let focusOrigin: HTMLElement | undefined

  function showSubmit(): void {
    setNoticeKind('submit')
  }

  // O envio recusado pede uma ação da pessoa; uma falha passiva de outra parte
  // da página não esconde esse aviso.
  function showFallback(): void {
    setNoticeKind(kind => kind ?? 'fallback')
  }

  onSettled(() => {
    globalThis.addEventListener(REFUSED_SUBMIT_EVENT, showSubmit)
    globalThis.addEventListener(OUTDATED_FALLBACK_EVENT, showFallback)
    return () => {
      globalThis.removeEventListener(REFUSED_SUBMIT_EVENT, showSubmit)
      globalThis.removeEventListener(OUTDATED_FALLBACK_EVENT, showFallback)
    }
  })

  const rememberFocusOrigin = createFocusOriginHandler(origin => {
    focusOrigin = origin
  })

  // Sem este desvio, fechar o aviso com o foco no botão deixa o foco no body.
  const dismiss: JSX.EventHandler<HTMLButtonElement, MouseEvent> = event => {
    const isFocused = event.currentTarget === document.activeElement
    setNoticeKind()
    if (isFocused && focusOrigin?.isConnected) focusOrigin.focus()
    focusOrigin = undefined
  }

  return (
    <Show when={noticeKind()}>
      {kind => (
        <section
          class={S.notice}
          aria-labelledby={titleId}
          onFocusIn={rememberFocusOrigin}
        >
          <span class={S.icon}>
            <IconWarning width={20} height={20} />
          </span>
          <div class={S.content} role="alert">
            <p id={titleId} class={S.title}>
              {NOTICE_MESSAGES[kind()].title()}
            </p>
            <p class={S.description}>{NOTICE_MESSAGES[kind()].description()}</p>
          </div>
          <div class={S.actions}>
            <Button size="sm" onClick={() => globalThis.location.reload()}>
              {m.outdatedPageNotice_reload()}
            </Button>
          </div>
          <Button
            class={S.close}
            variant="ghost"
            size="icon"
            aria-label={m.outdatedPageNotice_dismiss()}
            onClick={dismiss}
          >
            <IconClose width={18} height={18} />
          </Button>
        </section>
      )}
    </Show>
  )
}
