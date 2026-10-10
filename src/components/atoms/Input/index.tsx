import { isServer, type ComponentProps } from '@solidjs/web'
import { omit, untrack } from 'solid-js'

import S from './styles.module.css'

type InputProps = Omit<ComponentProps<'input'>, 'class'> & {
  variant?: 'default' | 'destructive'
  class?: string
}

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
  // Preserve absent native properties (a checkbox without value submits "on").
  // The SSR renderer needs value/checked rather than defaultValue/defaultChecked.
  const fieldState = () => {
    const value = props.value ?? initialValue
    const checked = props.checked ?? initialChecked
    return {
      ...(initialValue !== undefined && !isServer
        ? { defaultValue: initialValue }
        : {}),
      ...(value === undefined ? {} : { value }),
      ...(initialChecked !== undefined && !isServer
        ? { defaultChecked: initialChecked }
        : {}),
      ...(checked === undefined ? {} : { checked })
    }
  }
  return (
    <input
      {...rest}
      {...fieldState()}
      aria-invalid={
        props['aria-invalid'] ??
        (props.variant === 'destructive' ? 'true' : undefined)
      }
      class={[S.input, S[`variant_${props.variant ?? 'default'}`], props.class]}
    />
  )
}
