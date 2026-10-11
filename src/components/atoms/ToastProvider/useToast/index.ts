import { useContext } from 'solid-js'

import { ToastContext } from '../context.ts'
import type { ToastApi } from '../types.ts'

export function useToast(): ToastApi {
  return useContext(ToastContext)
}
