import { m } from '@paraglide/messages.js'
import { For } from 'solid-js'

import type { SitePage } from '@/@types/site-page.ts'

import S from './styles.module.css'

type SiteContentProps = { page: SitePage }

export function SiteContent(props: SiteContentProps) {
  return (
    <div class={S.content}>
      <For each={props.page.sections}>
        {section => (
          <section class={S.section}>
            <h2 class={S.heading}>{section.title}</h2>
            <For each={section.paragraphs}>
              {paragraph => <p class={S.paragraph}>{paragraph}</p>}
            </For>
          </section>
        )}
      </For>
      <footer class={S.footer}>
        <nav aria-label={m.siteContent_navigationLabel()} class={S.links}>
          <For each={props.page.links}>
            {link => (
              <a href={link.href} class={S.link}>
                {link.label}
              </a>
            )}
          </For>
        </nav>
      </footer>
    </div>
  )
}
