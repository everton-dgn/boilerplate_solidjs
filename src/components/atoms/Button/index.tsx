import type { ComponentProps } from '@solidjs/web'
import { omit } from 'solid-js'

import S from './styles.module.css'

type ButtonVariant =
  | 'default'
  | 'destructive'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link'

type ButtonSize = 'default' | 'xs' | 'sm' | 'lg' | 'icon'

type ButtonProps = Omit<ComponentProps<'button'>, 'class'> & {
  label?: string
  variant?: ButtonVariant
  size?: ButtonSize
  class?: string
}

export function Button(props: ButtonProps) {
  const rest = omit(props, 'label', 'variant', 'size', 'class', 'children')

  return (
    <button
      type="button"
      {...rest}
      class={[
        S.btn,
        S[`variant_${props.variant ?? 'default'}`],
        S[`size_${props.size ?? 'default'}`],
        props.class
      ]}
    >
      {props.label ?? props.children}
    </button>
  )
}
