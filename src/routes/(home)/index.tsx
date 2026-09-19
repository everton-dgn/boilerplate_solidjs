import SolidLogo from '~icons/my-images/solid'

import { PageBadge } from '@/components/atoms/PageBadge/index.tsx'

import S from './styles.module.css'

export default function Home() {
  return (
    <main class={S.page}>
      <span class={S.glow} aria-hidden="true" />

      <section class={S.hero}>
        <PageBadge>SolidJS Boilerplate</PageBadge>

        <h1 class={S.title}>Uma base limpa para produtos modernos</h1>

        <p class={S.description}>
          Comece seu próximo projeto com SolidJS 2, Vite+ e TypeScript. Uma base
          com renderização no servidor, temas claro e escuro.
        </p>

        <div class={S.logos}>
          <SolidLogo class={S.logo} />
        </div>

        <p class={S.subtitle}>SolidJS 2 · Vite+ · TypeScript 7</p>
      </section>
    </main>
  )
}
