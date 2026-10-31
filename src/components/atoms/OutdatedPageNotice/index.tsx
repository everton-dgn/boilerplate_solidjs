import { m } from '@paraglide/messages.js'
import type { JSX } from '@solidjs/web'
import { createSignal, createUniqueId, onSettled, Show } from 'solid-js'
import IconWarning from '~icons/hugeicons/alert-02'
import IconClose from '~icons/hugeicons/cancel-01'

import { REFUSED_SUBMIT_EVENT } from '@/constants/outdated-page.ts'
import { createFocusOriginHandler } from '@/helpers/createFocusOriginHandler/index.ts'

import { Button } from '../Button/index.tsx'

import S from './styles.module.css'

export function OutdatedPageNotice() {
  const [isVisible, setIsVisible] = createSignal(false)
  const titleId = createUniqueId()
  let focusOrigin: HTMLElement | undefined

  function show(): void {
    setIsVisible(true)
  }

  onSettled(() => {
    globalThis.addEventListener(REFUSED_SUBMIT_EVENT, show)
    return () => globalThis.removeEventListener(REFUSED_SUBMIT_EVENT, show)
  })

  const rememberFocusOrigin = createFocusOriginHandler(origin => {
    focusOrigin = origin
  })

  // Sem este desvio, fechar o aviso com o foco no botão deixa o foco no body.
  const dismiss: JSX.EventHandler<HTMLButtonElement, MouseEvent> = event => {
    const isFocused = event.currentTarget === document.activeElement
    setIsVisible(false)
    if (isFocused && focusOrigin?.isConnected) focusOrigin.focus()
    focusOrigin = undefined
  }

  return (
    <Show when={isVisible()}>
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
            {m.outdatedPageNotice_title()}
          </p>
          <p class={S.description}>{m.outdatedPageNotice_description()}</p>
        </div>
        <div class={S.actions}>
          <Button size="sm" onClick={() => globalThis.location.reload()}>
            {m.outdatedPageNotice_reload()}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.outdatedPageNotice_dismiss()}
            onClick={dismiss}
          >
            <IconClose width={18} height={18} />
          </Button>
        </div>
      </section>
    </Show>
  )
}
