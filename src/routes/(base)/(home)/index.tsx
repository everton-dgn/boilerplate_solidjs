import { m } from '@paraglide/messages.js'
import type { RouteDefinition } from '@solidjs/router'
import SolidLogo from '~icons/my-images/solid'

import { PageBadge } from '@/components/atoms/PageBadge/index.tsx'
import {
  PageHero,
  PageHeroDescription,
  PageHeroTitle
} from '@/components/molecules/PageHero/index.tsx'
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
      <PageHero>
        <PageBadge>{SITE.title}</PageBadge>

        <PageHeroTitle>{m.home_title()}</PageHeroTitle>

        <PageHeroDescription>
          {m.home_description({
            framework: 'SolidJS 2',
            toolchain: 'Vite+',
            language: 'TypeScript'
          })}
        </PageHeroDescription>

        <PageHeroDescription>{m.home_features()}</PageHeroDescription>

        <SolidLogo class={S.logo} />

        <p class={S.subtitle}>SolidJS 2 · Vite+ · TypeScript 7</p>
      </PageHero>
    </main>
  )
}
