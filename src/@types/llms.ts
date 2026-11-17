type LlmsRouteOptions = {
  section?: string
  optional?: boolean
}

// `true` includes the page, keeping the inherited section and optional mark
// (without inheritance, the default section); `false` excludes it, even when the
// layout included it; the object includes it and overrides only the declared fields.
export type LlmsRouteInfo = boolean | LlmsRouteOptions
