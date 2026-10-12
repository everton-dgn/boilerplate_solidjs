import { m } from '@paraglide/messages.js'
import type { RouteDefinition } from '@solidjs/router'
import SolidLogo from '~icons/my-images/solid'

import type { SitePage } from '@/@types/site-page.ts'
import { PageBadge } from '@/components/atoms/PageBadge/index.tsx'
import { SiteContent } from '@/components/molecules/SiteContent/index.tsx'
import { SITE } from '@/constants/site.ts'
import { readPageLinks, readSourceLinks } from '@/helpers/siteLinks/index.ts'

import S from './styles.module.css'

function readContent(): SitePage {
  return {
    title: m.home_title(),
    description: SITE.description,
    intro: m.home_description({
      framework: 'SolidJS 2',
      toolchain: 'Vite+',
      language: 'TypeScript'
    }),
    sections: [
      {
        title: m.home_featuresTitle(),
        paragraphs: [m.home_features()]
      },
      {
        title: m.home_usageTitle(),
        paragraphs: [m.home_usage()]
      }
    ],
    links: [...readPageLinks(), ...readSourceLinks()]
  }
}

export const route = {
  info: {
    llms: true,
    content: readContent,
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
