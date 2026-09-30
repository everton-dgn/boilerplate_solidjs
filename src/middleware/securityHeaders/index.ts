import { applySecurityHeaders } from '../helpers/applySecurityHeaders/index.ts'
import type { Next } from '../types.ts'

export async function securityHeaders(
  _request: Request,
  next: Next
): Promise<Response> {
  return applySecurityHeaders(await next())
}
