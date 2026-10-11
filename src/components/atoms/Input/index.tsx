import { isServer, type ComponentProps } from '@solidjs/web'
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
  // O renderizador SSR precisa de value/checked em vez de defaultValue/defaultChecked.
  const fieldState = (): InputFieldState => {
    const value = props.value ?? initialValue
    const checked = props.checked ?? initialChecked
    const fields: InputFieldState = {}

    if (initialValue !== undefined && !isServer) {
      fields.defaultValue = initialValue
    }
    if (value !== undefined) fields.value = value

    if (initialChecked !== undefined && !isServer) {
      fields.defaultChecked = initialChecked
    }
    if (checked !== undefined) fields.checked = checked

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
