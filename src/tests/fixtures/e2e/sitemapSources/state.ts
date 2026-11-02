const state = { hasRemovedPart: false }

export function isPartRemoved(): boolean {
  return state.hasRemovedPart
}

export function setPartRemoved(isRemoved: boolean): void {
  state.hasRemovedPart = isRemoved
}
