import 'server-only'

// A Response without a body is the control signal of the framework (redirect or
// reload); one with a body may carry upstream data. The one from Response.error()
// has no body either, but status 0 does not go out as an HTTP response. The
// middleware, the error hook and the operation wrapper use this same
// classification.
export function isControlResponse(value: unknown): value is Response {
  try {
    return (
      value instanceof Response && value.body === null && value.status !== 0
    )
  } catch {
    // Inspecting a thrown object can also fail (a getter or a Proxy).
    return false
  }
}
