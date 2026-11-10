import { m } from '@paraglide/messages.js'
import type { JSX } from '@solidjs/web'
import { For } from 'solid-js'
import IconGithub from '~icons/hugeicons/github'

import { LocalizedLink } from '@/components/atoms/LocalizedLink/index.tsx'
import { LocaleSwitcher } from '@/components/molecules/LocaleSwitcher/index.tsx'
import { ThemeToggle } from '@/components/molecules/ThemeToggle/index.tsx'
import { SITE } from '@/constants/site/index.ts'
import { SITE_LINKS } from '@/constants/siteLinks/index.ts'

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
        {SITE.title}
      </LocalizedLink>

      <nav class={S.nav} aria-label={m.topbar_navigation()}>
        <For each={SITE_LINKS.pages}>
          {link => <NavItem href={link.href} label={link.label} />}
        </For>
        <NavItem href="/404" label="404" />
      </nav>

      <div class={S.actions}>
        {props.children}
        <a
          class={S.github_link}
          href={SITE_LINKS.repository.href}
          aria-label={SITE_LINKS.repository.label}
          title={SITE_LINKS.repository.label}
        >
          <IconGithub />
        </a>
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
    </header>
  )
}
