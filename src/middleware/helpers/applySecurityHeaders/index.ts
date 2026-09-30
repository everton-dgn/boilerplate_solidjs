import { withHeaders } from '../withHeaders/index.ts'

function applySecurityHeaders(response: Response): Response {
  return withHeaders({
    response,
    headers: {
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    }
  })
}

export { applySecurityHeaders }
