import { useLinkState } from '@solidjs/router'

import { LocalizedLink } from '@/components/atoms/LocalizedLink/index.tsx'
import { localizeHref } from '@/i18n/urls/index.ts'

import S from './styles.module.css'

type NavItemProps = {
  href: string
  label: string
}

export function NavItem(props: NavItemProps) {
  const link = useLinkState(() => localizeHref({ href: props.href }), {
    end: true
  })

  return (
    <LocalizedLink
      href={props.href}
      class={[S.link, link.current() ? S.active : undefined]}
      aria-current={link.current() ? 'page' : undefined}
    >
      {props.label}
      <span class={S.indicator} aria-hidden="true" />
    </LocalizedLink>
  )
}
