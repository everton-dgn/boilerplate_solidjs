import { SiteContent } from '@/components/molecules/SiteContent/index.tsx'
import type { SitePage } from '@/data/readSitePage/types.ts'

import S from './styles.module.css'

type SiteArticleProps = { page: SitePage }

export function SiteArticle(props: SiteArticleProps) {
  return (
    <main class={S.page}>
      <div class={S.introduction}>
        <h1 class={S.title}>{props.page.title}</h1>
        <p class={S.description}>{props.page.intro}</p>
      </div>
      <SiteContent page={props.page} />
    </main>
  )
}
