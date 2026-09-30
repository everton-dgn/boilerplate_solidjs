import { provideRequestEvent } from '@solidjs/web/storage'

import { requestNonce } from '../index.ts'

// 16 bytes em base64: 22 caracteres e o preenchimento.
const NONCE_FORMAT = /^[A-Za-z0-9+/]{22}==$/u
const REQUESTS = 50

type NonceEvent = {
  request: Request
  locals: { nonce?: string }
  response: { headers: Headers }
}

function nonceEvent(): NonceEvent {
  return {
    request: new Request('http://localhost'),
    locals: {},
    response: { headers: new Headers() }
  }
}

// O nonce de uma requisição nova.
function freshNonce(): string | undefined {
  return provideRequestEvent(nonceEvent(), () => requestNonce())
}

describe('nonce CSP da requisição', () => {
  it('cria um nonce base64 de 128 bits e o grava em locals', () => {
    const event = nonceEvent()

    const nonce = provideRequestEvent(event, () => requestNonce())

    expect(nonce).toMatch(NONCE_FORMAT)
    expect(event.locals.nonce).toBe(nonce)
  })

  it('devolve o mesmo nonce durante a requisição', () => {
    const event = nonceEvent()

    const [first, second] = provideRequestEvent(event, () => [
      requestNonce(),
      requestNonce()
    ])

    expect(second).toBe(first)
  })

  it('preserva o nonce já gravado em locals', () => {
    const event: NonceEvent = {
      ...nonceEvent(),
      locals: { nonce: 'existente' }
    }

    expect(provideRequestEvent(event, () => requestNonce())).toBe('existente')
  })

  it('gera um nonce diferente a cada requisição', () => {
    const nonces = Array.from({ length: REQUESTS }, freshNonce)

    expect(new Set(nonces).size).toBe(REQUESTS)
  })

  it('não cria nonce fora de uma requisição', () => {
    expect(requestNonce()).toBeUndefined()
  })
})
