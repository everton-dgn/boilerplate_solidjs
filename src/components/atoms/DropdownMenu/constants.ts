type NavigationStep = (current: number) => number

const STEP = 1
const DROPDOWN_LAST_INDEX = -1

export const DROPDOWN_FIRST_INDEX = 0

export const DROPDOWN_ITEM_SELECTOR =
  '[data-dropdown-item]:not([aria-disabled="true"])'

export const DROPDOWN_SELECT_KEYS: readonly string[] = ['Enter', ' ']

export const DROPDOWN_NAVIGATION: Record<string, NavigationStep | undefined> = {
  ArrowDown: current => current + STEP,
  ArrowUp: current => current - STEP,
  Home: () => DROPDOWN_FIRST_INDEX,
  End: () => DROPDOWN_LAST_INDEX
}

export const DROPDOWN_OPEN_INDEX: Record<string, number | undefined> = {
  ArrowDown: DROPDOWN_FIRST_INDEX,
  ArrowUp: DROPDOWN_LAST_INDEX
}
