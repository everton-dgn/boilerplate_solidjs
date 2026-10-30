type NavigationStep = (current: number) => number

export const DROPDOWN_ITEM_SELECTOR =
  '[data-dropdown-item]:not([aria-disabled="true"])'

export const DROPDOWN_SELECT_KEYS: readonly string[] = ['Enter', ' ']

export const DROPDOWN_NAVIGATION: Record<string, NavigationStep | undefined> = {
  ArrowDown: current => current + 1,
  ArrowUp: current => current - 1,
  Home: () => 0,
  End: () => -1
}

export const DROPDOWN_OPEN_INDEX: Record<string, number | undefined> = {
  ArrowDown: 0,
  ArrowUp: -1
}
