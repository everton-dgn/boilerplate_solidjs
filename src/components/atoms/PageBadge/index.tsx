import type { JSX } from '@solidjs/web'

import S from './styles.module.css'

type PageBadgeProps = {
  children: JSX.Element
  class?: string
}

export function PageBadge(props: PageBadgeProps) {
  return (
    <p class={[S.badge, props.class]}>
      <span class={S.dot} aria-hidden="true" />
      {props.children}
    </p>
  )
}
