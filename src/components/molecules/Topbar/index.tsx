import type { JSX } from '@solidjs/web'
import { For } from 'solid-js'

import { ThemeToggle } from '@/components/atoms/ThemeToggle/index.tsx'

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
      <a href="/" class={S.brand}>
        {BRAND_NAME}
      </a>

      <nav class={S.nav} aria-label="Principal">
        <For each={NAV_LINKS}>
          {link => <NavItem href={link.href} label={link.label} />}
        </For>
      </nav>

      <div class={S.actions}>
        {props.children}
        <ThemeToggle />
      </div>
    </header>
  )
}
