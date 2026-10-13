import type { RouteDefinition } from '@solidjs/router'
import SolidLogo from '~icons/my-images/solid'

import { PageBadge } from '@/components/atoms/PageBadge/index.tsx'
import { SiteContent } from '@/components/molecules/SiteContent/index.tsx'

import { content, seo } from './seo.ts'

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
          <PageBadge>SolidJS Boilerplate</PageBadge>

          <h1 class={S.title}>{content.title}</h1>

          <p class={S.description}>{content.intro}</p>

          <div class={S.logos}>
            <SolidLogo class={S.logo} />
          </div>

          <p class={S.subtitle}>SolidJS 2 · Vite+ · TypeScript 7</p>
        </section>
      </div>
      <SiteContent page={content} />
    </main>
  )
}
