import { createNonce } from '../index.ts'

// 16 bytes em base64 ocupam 24 caracteres, com dois de preenchimento.
const NONCE_BYTES = 16
const NONCE_LENGTH = 24

describe('nonce de CSP', () => {
  it('codifica 16 bytes aleatórios em base64', () => {
    const nonce = createNonce()

    expect(nonce).toHaveLength(NONCE_LENGTH)
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/u)
    expect(atob(nonce)).toHaveLength(NONCE_BYTES)
  })

  it('gera um valor novo a cada chamada', () => {
    expect(createNonce()).not.toBe(createNonce())
  })
})
