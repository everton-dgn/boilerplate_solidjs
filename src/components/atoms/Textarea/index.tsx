import type { ComponentProps } from '@solidjs/web'
import { omit, untrack } from 'solid-js'

import S from '../Input/styles.module.css'

type TextareaProps = Omit<ComponentProps<'textarea'>, 'class'> & {
  variant?: 'default' | 'destructive'
  class?: string
}

export function Textarea(props: TextareaProps) {
  const rest = omit(props, 'variant', 'class', 'defaultValue', 'value')
  const initialValue = untrack(() => props.defaultValue)
  // On the client, an uncontrolled value would be written again over the edit
  // whenever another prop of the field changed.
  const fieldState = (): Pick<TextareaProps, 'value'> =>
    props.value === undefined ? {} : { value: props.value }
  return (
    <textarea
      {...rest}
      defaultValue={initialValue}
      {...fieldState()}
      aria-invalid={
        props['aria-invalid'] ??
        (props.variant === 'destructive' ? 'true' : undefined)
      }
      class={[
        S.field,
        S.textarea,
        S[`variant_${props.variant ?? 'default'}`],
        props.class
      ]}
    />
  )
}
