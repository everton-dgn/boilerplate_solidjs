import 'server-only'

type FailureSource =
  | 'server-operation'
  | 'server-error'
  | 'middleware'
  | 'error-page'

// Mensagens fixas por origem. A função não recebe o erro, argumentos, URLs
// nem corpos upstream, então nada privado chega ao log por aqui.
const MESSAGES = {
  'server-operation':
    '[server-operation] Unexpected failure; private details omitted',
  'server-error': '[server-error] Unexpected failure; private details omitted',
  middleware: '[middleware] Unexpected failure; private details omitted',
  'error-page': '[error-page] Unexpected failure; private details omitted'
} as const satisfies Record<FailureSource, string>

export function logServerFailure(source: FailureSource): void {
  console.error(MESSAGES[source])
}
