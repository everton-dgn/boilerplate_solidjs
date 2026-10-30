import type { JSX } from '@solidjs/web'

import S from './styles.module.css'

type PageBadgeProps = {
  children: JSX.Element
}

export function PageBadge(props: PageBadgeProps) {
  return (
    <p class={S.badge}>
      <span class={S.dot} aria-hidden="true" />
      {props.children}
    </p>
  )
}
