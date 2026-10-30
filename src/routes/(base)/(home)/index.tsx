import { m } from '@paraglide/messages.js'
import type { RouteDefinition } from '@solidjs/router'
import SolidLogo from '~icons/my-images/solid'

import { PageBadge } from '@/components/atoms/PageBadge/index.tsx'
import { SITE } from '@/constants/site/index.ts'

import { seo } from './seo.ts'

import S from './styles.module.css'

export const route = {
  info: {
    llms: true,
    markdown: true,
    seo
  }
} satisfies RouteDefinition

export default function Home() {
  return (
    <main>
      <div class={S.page}>
        <span class={S.glow} aria-hidden="true" />

        <section class={S.hero}>
          <PageBadge>{SITE.title}</PageBadge>

          <h1 class={S.title}>{m.home_title()}</h1>

          <p class={S.description}>
            {m.home_description({
              framework: 'SolidJS 2',
              toolchain: 'Vite+',
              language: 'TypeScript'
            })}
          </p>

          <p class={S.description}>{m.home_features()}</p>

          <SolidLogo class={S.logo} />

          <p class={S.subtitle}>SolidJS 2 · Vite+ · TypeScript 7</p>
        </section>
      </div>
    </main>
  )
}
