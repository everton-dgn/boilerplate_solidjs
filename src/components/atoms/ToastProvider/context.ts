import { createContext } from 'solid-js'

import type { ToastApi } from './types.ts'

export const ToastContext = createContext<ToastApi>()
