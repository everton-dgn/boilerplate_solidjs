import { createContext } from 'solid-js'

import type {
  DropdownMenuContextValue,
  DropdownMenuRadioContextValue
} from './types.ts'

export const DropdownMenuContext = createContext<DropdownMenuContextValue>()

export const DropdownMenuRadioContext =
  createContext<DropdownMenuRadioContextValue>()
