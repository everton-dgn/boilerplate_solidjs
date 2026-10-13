import { m } from '@paraglide/messages.js'
import type { RouteDefinition } from '@solidjs/router'
import SolidLogo from '~icons/my-images/solid'

import { PageBadge } from '@/components/atoms/PageBadge/index.tsx'
import { SiteContent } from '@/components/molecules/SiteContent/index.tsx'

import { readContent } from './helpers/readContent/index.ts'

import S from './styles.module.css'

export const route = {
  info: {
    llms: true,
    markdown: { source: '@/routes/(base)/(home)/helpers/markdown.ts' },
    seo: {
      get title() {
        return m.home_seoTitle()
      }
    }
  }
} satisfies RouteDefinition

export default function Home() {
  return (
    <main>
      <div class={S.page}>
        <span class={S.glow} aria-hidden="true" />

        <section class={S.hero}>
          <PageBadge>SolidJS Boilerplate</PageBadge>

          <h1 class={S.title}>{readContent().title}</h1>

          <p class={S.description}>{readContent().intro}</p>

          <div class={S.logos}>
            <SolidLogo class={S.logo} />
          </div>

          <p class={S.subtitle}>SolidJS 2 · Vite+ · TypeScript 7</p>
        </section>
      </div>
      <SiteContent page={readContent()} />
    </main>
  )
}
