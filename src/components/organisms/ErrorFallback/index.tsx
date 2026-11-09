import { dynamicComponent, httpStatus, useHead } from '@solidjs/web'
import { createUniqueId, untrack } from 'solid-js'

import { LocalizedLink } from '@/components/atoms/LocalizedLink/index.tsx'
import { PageBadge } from '@/components/atoms/PageBadge/index.tsx'
import {
  PageHero,
  PageHeroDescription,
  PageHeroTitle
} from '@/components/molecules/PageHero/index.tsx'
import { HTTP_INTERNAL_SERVER_ERROR } from '@/constants/http.ts'
import { paths } from '@/router.ts'

import { ERROR_FALLBACK_CONTENT } from './constants.ts'
import type { ErrorFallbackKind } from './types.ts'

import S from './styles.module.css'

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
  const Icon = dynamicComponent(() => content().icon)

  useHead(() =>
    props.kind === 'runtime'
      ? [
          { tag: 'title', props: { children: content().title } },
          {
            tag: 'meta',
            props: { name: 'description', content: content().description }
          },
          { tag: 'meta', props: { name: 'robots', content: 'noindex' } }
        ]
      : []
  )

  return (
    <main data-error-variant={props.kind}>
      <PageHero aria-labelledby={titleId} aria-describedby={descriptionId}>
        <PageBadge>{content().badge}</PageBadge>

        <PageHeroTitle id={titleId}>{content().title}</PageHeroTitle>

        <PageHeroDescription id={descriptionId}>
          {content().description}
        </PageHeroDescription>

        <LocalizedLink
          href={props.kind === 'runtime' ? '' : paths}
          target={props.kind === 'runtime' ? '_self' : undefined}
          class={S.home_link}
        >
          <Icon />
          <span>{content().actionLabel}</span>
        </LocalizedLink>
      </PageHero>
    </main>
  )
}
