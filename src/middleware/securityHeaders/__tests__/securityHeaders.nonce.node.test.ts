import { createRequestEvent, type RequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'

import { requestNonce } from '../index.ts'

// 16 bytes em base64: 22 caracteres e o preenchimento.
const NONCE_FORMAT = /^[A-Za-z0-9+/]{22}==$/u
const NONCE_BYTES = 16
const REQUESTS = 50

function nonceEvent(): RequestEvent {
  return createRequestEvent(new Request('http://localhost'))
}

// O nonce de uma requisição nova.
function freshNonce(): string | undefined {
  return provideRequestEvent(nonceEvent(), () => requestNonce())
}

describe('nonce CSP da requisição', () => {
  it('cria um nonce base64 de 128 bits e o grava no evento', () => {
    const event = nonceEvent()

    const nonce = provideRequestEvent(event, () => requestNonce())

    expect(nonce).toMatch(NONCE_FORMAT)
    expect(atob(nonce ?? '')).toHaveLength(NONCE_BYTES)
    expect(event.nonce).toBe(nonce)
  })

  it('devolve o mesmo nonce durante a requisição', () => {
    const event = nonceEvent()

    const [first, second] = provideRequestEvent(event, () => [
      requestNonce(),
      requestNonce()
    ])

    expect(second).toBe(first)
  })

  it('preserva o nonce já gravado no evento', () => {
    const event = nonceEvent()
    event.nonce = 'existente'

    expect(provideRequestEvent(event, () => requestNonce())).toBe('existente')
  })

  it('usa o nonce de scripts quando o host separa scripts e estilos', () => {
    const event = nonceEvent()
    event.nonce = { script: 'scripts', style: 'estilos' }

    expect(provideRequestEvent(event, () => requestNonce())).toBe('scripts')
    expect(event.nonce).toStrictEqual({ script: 'scripts', style: 'estilos' })
  })

  it('preserva scripts desativados pelo host', () => {
    const event = nonceEvent()
    event.nonce = { script: false, style: 'estilos' }

    expect(provideRequestEvent(event, () => requestNonce())).toBeUndefined()
    expect(event.nonce.script).toBe(false)
  })

  it('gera um nonce diferente a cada requisição', () => {
    const nonces = Array.from({ length: REQUESTS }, freshNonce)

    expect(new Set(nonces).size).toBe(REQUESTS)
  })

  it('não cria nonce fora de uma requisição', () => {
    expect(requestNonce()).toBeUndefined()
  })
})
