import { applySecurityHeaders } from '../../../securityHeaders/index.ts'

export function uncachedResponse(response: Response): Response {
  response.headers.set('cache-control', 'private, no-store')
  return applySecurityHeaders(response)
}
