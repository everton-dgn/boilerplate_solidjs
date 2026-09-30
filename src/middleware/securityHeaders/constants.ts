// Cabeçalhos de segurança de toda resposta que passa pelo middleware. O
// Cross-Origin-Embedder-Policy exige que recursos de outra origem respondam
// com CORP ou CORS; os recursos do app são da mesma origem.
export const SECURITY_HEADERS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'same-origin'
} as const

// Diretivas fixas da Content-Security-Policy. O script-src depende do nonce da
// requisição e é montado em applySecurityHeaders. O style-src mantém
// 'unsafe-inline' porque o runtime e o Vite gravam estilos inline.
export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
] as const
