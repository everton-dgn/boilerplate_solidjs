// The synthetic marker is created in the backend after the build and fills the
// message, the cause and an own property.
export function fixtureError(marker: string): Error {
  return Object.assign(new Error(marker, { cause: `CAUSE_${marker}` }), {
    internalContext: `CONTEXT_${marker}`
  })
}
