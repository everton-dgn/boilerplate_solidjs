import { isServer, type ComponentProps } from '@solidjs/web'
import { omit, untrack } from 'solid-js'

import S from '../Input/styles.module.css'

type TextareaProps = Omit<ComponentProps<'textarea'>, 'class'> & {
  variant?: 'default' | 'destructive'
  class?: string
}

export function Textarea(props: TextareaProps) {
  const rest = omit(props, 'variant', 'class', 'defaultValue', 'value')
  const initialValue = untrack(() => props.defaultValue)
  // No cliente, um value sem controle seria regravado por cima da edição
  // sempre que outra prop do campo mudasse.
  const fieldState = (): Pick<TextareaProps, 'value'> => {
    const value = isServer ? (props.value ?? initialValue) : props.value
    return value === undefined ? {} : { value }
  }
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
