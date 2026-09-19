import { useLinkState } from '@solidjs/router'

import S from './styles.module.css'

type NavItemProps = {
  href: string
  label: string
}

export function NavItem(props: NavItemProps) {
  const link = useLinkState(() => props.href, { end: true })

  return (
    <a
      href={props.href}
      class={[S.link, link.current() ? S.active : undefined]}
      aria-current={link.current() ? 'page' : undefined}
    >
      {props.label}
      <span class={S.indicator} aria-hidden="true" />
    </a>
  )
}
