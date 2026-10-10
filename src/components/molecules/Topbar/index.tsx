import type { JSX } from '@solidjs/web'
import { For } from 'solid-js'

import { LocaleSwitcher } from '@/components/atoms/LocaleSwitcher/index.tsx'
import { LocalizedLink } from '@/components/atoms/LocalizedLink/index.tsx'
import { ThemeToggle } from '@/components/atoms/ThemeToggle/index.tsx'
import { m } from '@/paraglide/messages.js'

import { BRAND_NAME, NAV_LINKS } from './constants.ts'
import { NavItem } from './NavItem/index.tsx'

import S from './styles.module.css'

type TopbarProps = {
  children?: JSX.Element
  class?: string
}

export function Topbar(props: TopbarProps) {
  return (
    <header class={[S.topbar, props.class]}>
      <LocalizedLink href="/" class={S.brand}>
        {BRAND_NAME}
      </LocalizedLink>

      <nav class={S.nav} aria-label={m.topbar_navigation()}>
        <For each={NAV_LINKS}>
          {link => <NavItem href={link.href} label={link.label} />}
        </For>
      </nav>

      <div class={S.actions}>
        {props.children}
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
    </header>
  )
}
