// 128 bits, o mínimo recomendado para um nonce de CSP.
const NONCE_BYTES = 16

// Nonce CSP novo, em base64. O securityHeaders o cria sob demanda; a entrada de
// produção (src/entry-handler.ts) o cria antes da requisição.
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
  return btoa(String.fromCodePoint(...bytes))
}
