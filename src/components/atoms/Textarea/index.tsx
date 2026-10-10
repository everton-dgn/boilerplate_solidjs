import type { ComponentProps } from '@solidjs/web'
import { omit, untrack } from 'solid-js'

import S from './styles.module.css'

type TextareaProps = Omit<ComponentProps<'textarea'>, 'class'> & {
  variant?: 'default' | 'destructive'
  class?: string
}

export function Textarea(props: TextareaProps) {
  const rest = omit(props, 'variant', 'class', 'defaultValue', 'value')
  const initialValue = untrack(() => props.defaultValue)
  return (
    <textarea
      {...rest}
      defaultValue={initialValue}
      value={props.value ?? initialValue}
      aria-invalid={
        props['aria-invalid'] ??
        (props.variant === 'destructive' ? 'true' : undefined)
      }
      class={[
        S.textarea,
        S[`variant_${props.variant ?? 'default'}`],
        props.class
      ]}
    />
  )
}
