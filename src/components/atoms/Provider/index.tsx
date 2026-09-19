import type { ParentProps } from 'solid-js'

import { createTheme } from '@/primitives/createTheme/index.ts'

import { ThemeContext } from './context.ts'

export function Provider(props: ParentProps) {
  return <ThemeContext value={createTheme()}>{props.children}</ThemeContext>
}
