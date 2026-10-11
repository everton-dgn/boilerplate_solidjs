import type { ParentProps } from 'solid-js'

import { createTheme } from '@/primitives/createTheme/index.ts'

import { ToastProvider } from '../ToastProvider/index.tsx'
import { ThemeContext } from './context.ts'

export function Provider(props: ParentProps) {
  return (
    <ThemeContext value={createTheme()}>
      <ToastProvider>{props.children}</ToastProvider>
    </ThemeContext>
  )
}
