import { Dynamic, httpStatus } from '@solidjs/web'
import { createUniqueId, untrack } from 'solid-js'

import { PageBadge } from '@/components/atoms/PageBadge/index.tsx'
import { paths } from '@/router.ts'

import { ERROR_FALLBACK_CONTENT } from './constants.ts'
import type { ErrorFallbackKind } from './types.ts'

import S from './styles.module.css'

const HTTP_INTERNAL_SERVER_ERROR = 500

type ErrorFallbackProps = {
  kind: ErrorFallbackKind
}

export function ErrorFallback(props: ErrorFallbackProps) {
  if (untrack(() => props.kind) === 'runtime') {
    httpStatus(HTTP_INTERNAL_SERVER_ERROR)
  }

  const id = createUniqueId()
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`
  const content = () => ERROR_FALLBACK_CONTENT[props.kind]

  return (
    <main class={S.page} data-error-variant={props.kind}>
      <div class={S.glow} aria-hidden="true" />

      <section
        class={S.hero}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <PageBadge>{content().badge}</PageBadge>

        <h1 id={titleId} class={S.title}>
          {content().title}
        </h1>

        <p id={descriptionId} class={S.description}>
          {content().description}
        </p>

        <a
          href={props.kind === 'runtime' ? '' : paths}
          target={props.kind === 'runtime' ? '_self' : undefined}
          class={S.home_link}
        >
          <Dynamic component={content().icon} />
          <span>{content().actionLabel}</span>
        </a>
      </section>
    </main>
  )
}
