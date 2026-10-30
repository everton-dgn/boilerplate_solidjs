import { createContext } from 'solid-js'

import type { ThemeState } from './createTheme/types.ts'

export const ThemeContext = createContext<ThemeState>()
