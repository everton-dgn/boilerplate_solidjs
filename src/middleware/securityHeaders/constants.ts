// Security headers of every response that goes through the middleware.
// Cross-Origin-Embedder-Policy requires resources from another origin to answer
// with CORP or CORS; the resources of the app are same-origin.
export const SECURITY_HEADERS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'same-origin'
} as const

// Fixed Content-Security-Policy directives. script-src depends on the nonce of
// the request and is built in applySecurityHeaders. In the build, styles only
// arrive through a same-origin <link>; a <style> or a style attribute in the HTML
// is blocked. The SSR theme goes through the .light/.dark classes of <html>.
export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "style-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
] as const
