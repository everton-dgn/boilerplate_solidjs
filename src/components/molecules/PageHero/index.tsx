import type { ComponentProps } from '@solidjs/web'
import { omit } from 'solid-js'

import S from './styles.module.css'

type HeroProps = Omit<ComponentProps<'section'>, 'class'>
type TitleProps = Omit<ComponentProps<'h1'>, 'class'>
type DescriptionProps = Omit<ComponentProps<'p'>, 'class'>

export function PageHero(props: HeroProps) {
  const rest = omit(props, 'children')

  return (
    <div class={S.page}>
      <span class={S.glow} aria-hidden="true" />
      <section {...rest} class={S.hero}>
        {props.children}
      </section>
    </div>
  )
}

export function PageHeroTitle(props: TitleProps) {
  const rest = omit(props, 'children')

  return (
    <h1 {...rest} class={S.title}>
      {props.children}
    </h1>
  )
}

export function PageHeroDescription(props: DescriptionProps) {
  const rest = omit(props, 'children')

  return (
    <p {...rest} class={S.description}>
      {props.children}
    </p>
  )
}
