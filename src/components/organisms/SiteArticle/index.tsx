import { m } from '@paraglide/messages.js'
import { For } from 'solid-js'

import type { SitePage } from '@/@types/site-page.ts'
import { LocalizedLink } from '@/components/atoms/LocalizedLink/index.tsx'

import S from './styles.module.css'

type SiteArticleProps = { page: SitePage }

export function SiteArticle(props: SiteArticleProps) {
  return (
    <main class={S.page}>
      <div class={S.introduction}>
        <h1 class={S.title}>{props.page.title}</h1>
        <p class={S.description}>{props.page.intro}</p>
      </div>
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
          <nav aria-label={m.siteArticle_navigationLabel()} class={S.links}>
            <For each={props.page.links}>
              {link => (
                <LocalizedLink href={link.href} class={S.link}>
                  {link.label}
                </LocalizedLink>
              )}
            </For>
          </nav>
        </footer>
      </div>
    </main>
  )
}
