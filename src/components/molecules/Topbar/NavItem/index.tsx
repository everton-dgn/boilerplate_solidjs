import { LocalizedLink } from '@/components/atoms/LocalizedLink/index.tsx'

import S from './styles.module.css'

type NavItemProps = {
  href: string
  label: string
}

export function NavItem(props: NavItemProps) {
  return (
    <LocalizedLink href={props.href} class={S.link}>
      {props.label}
      <span class={S.indicator} aria-hidden="true" />
    </LocalizedLink>
  )
}
