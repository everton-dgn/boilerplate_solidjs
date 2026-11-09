import type { ParentProps } from 'solid-js'

import { ToastProvider } from '@/components/atoms/ToastProvider/index.tsx'
import { createTheme } from '@/primitives/createTheme/index.ts'

import { ThemeContext } from './context.ts'

export function Provider(props: ParentProps) {
  return (
    <ThemeContext value={createTheme()}>
      <ToastProvider>{props.children}</ToastProvider>
    </ThemeContext>
  )
}
