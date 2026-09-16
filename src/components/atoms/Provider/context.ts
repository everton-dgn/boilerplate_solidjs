import { createContext } from 'solid-js'

import type { ThemeState } from '@/primitives/createTheme/types.ts'

export const ThemeContext = createContext<ThemeState>()
