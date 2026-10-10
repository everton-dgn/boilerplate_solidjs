import type { RouteDefinition } from '@solidjs/router'
import SolidLogo from '~icons/my-images/solid'

import { PageBadge } from '@/components/atoms/PageBadge/index.tsx'
import { m } from '@/paraglide/messages.js'

import S from './styles.module.css'

export const route = {
  info: { llms: true }
} satisfies RouteDefinition

export default function Home() {
  return (
    <main class={S.page}>
      <span class={S.glow} aria-hidden="true" />

      <section class={S.hero}>
        <PageBadge>SolidJS Boilerplate</PageBadge>

        <h1 class={S.title}>{m.home_title()}</h1>

        <p class={S.description}>
          {m.home_description({
            framework: 'SolidJS 2',
            toolchain: 'Vite+',
            language: 'TypeScript'
          })}
        </p>

        <div class={S.logos}>
          <SolidLogo class={S.logo} />
        </div>

        <p class={S.subtitle}>SolidJS 2 · Vite+ · TypeScript 7</p>
      </section>
    </main>
  )
}
