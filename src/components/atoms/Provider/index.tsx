import type { ParentProps } from 'solid-js'

import { ToastProvider } from '../ToastProvider/index.tsx'
import { ThemeContext } from './context.ts'
import { createTheme } from './createTheme/index.ts'

export function Provider(props: ParentProps) {
  return (
    <ThemeContext value={createTheme()}>
      <ToastProvider>{props.children}</ToastProvider>
    </ThemeContext>
  )
}
