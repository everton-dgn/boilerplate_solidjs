// 128 bits, o mínimo recomendado para um nonce de CSP.
const NONCE_BYTES = 16

export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
  return btoa(String.fromCodePoint(...bytes))
}
