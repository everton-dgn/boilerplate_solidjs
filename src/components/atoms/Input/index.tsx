import type { ComponentProps } from '@solidjs/web'
import { omit, untrack } from 'solid-js'

import S from './styles.module.css'

type InputProps = Omit<ComponentProps<'input'>, 'class'> & {
  variant?: 'default' | 'destructive'
  class?: string
}

type InputFieldState = Pick<
  InputProps,
  'defaultValue' | 'value' | 'defaultChecked' | 'checked'
>

export function Input(props: InputProps) {
  const rest = omit(
    props,
    'variant',
    'class',
    'defaultValue',
    'value',
    'defaultChecked',
    'checked'
  )
  const initialValue = untrack(() => props.defaultValue)
  const initialChecked = untrack(() => props.defaultChecked)
  // Preserva a ausência das propriedades nativas (um checkbox sem value envia "on").
  // No cliente, value/checked sem controle seriam regravados por cima da edição
  // sempre que outra prop do campo mudasse.
  const fieldState = (): InputFieldState => {
    const fields: InputFieldState = {}

    if (initialValue !== undefined) fields.defaultValue = initialValue
    if (props.value !== undefined) fields.value = props.value

    if (initialChecked !== undefined) fields.defaultChecked = initialChecked
    if (props.checked !== undefined) fields.checked = props.checked

    return fields
  }
  return (
    <input
      {...rest}
      {...fieldState()}
      aria-invalid={
        props['aria-invalid'] ??
        (props.variant === 'destructive' ? 'true' : undefined)
      }
      class={[
        S.field,
        S.input,
        S[`variant_${props.variant ?? 'default'}`],
        props.class
      ]}
    />
  )
}
