import { createRequestEvent, type RequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'

import { requestNonce } from '../index.ts'

// 16 bytes in base64: 22 characters and the padding.
const NONCE_FORMAT = /^[A-Za-z0-9+/]{22}==$/u
const NONCE_BYTES = 16
const REQUESTS = 50

function nonceEvent(): RequestEvent {
  return createRequestEvent(new Request('http://localhost'))
}

// The nonce of a new request.
function freshNonce(): string | undefined {
  return provideRequestEvent(nonceEvent(), () => requestNonce())
}

describe('CSP nonce of the request', () => {
  it('creates a 128-bit base64 nonce and writes it on the event', () => {
    const event = nonceEvent()

    const nonce = provideRequestEvent(event, () => requestNonce())

    expect(nonce).toMatch(NONCE_FORMAT)
    expect(atob(nonce ?? '')).toHaveLength(NONCE_BYTES)
    expect(event.nonce).toBe(nonce)
  })

  it('returns the same nonce during the request', () => {
    const event = nonceEvent()

    const [first, second] = provideRequestEvent(event, () => [
      requestNonce(),
      requestNonce()
    ])

    expect(second).toBe(first)
  })

  it('keeps the nonce already written on the event', () => {
    const event = nonceEvent()
    event.nonce = 'existing'

    expect(provideRequestEvent(event, () => requestNonce())).toBe('existing')
  })

  it('uses the script nonce when the host separates scripts and styles', () => {
    const event = nonceEvent()
    event.nonce = { script: 'scripts', style: 'styles' }

    expect(provideRequestEvent(event, () => requestNonce())).toBe('scripts')
    expect(event.nonce).toStrictEqual({ script: 'scripts', style: 'styles' })
  })

  it('keeps scripts disabled by the host', () => {
    const event = nonceEvent()
    event.nonce = { script: false, style: 'styles' }

    expect(provideRequestEvent(event, () => requestNonce())).toBeUndefined()
    expect(event.nonce.script).toBe(false)
  })

  it('generates a different nonce on each request', () => {
    const nonces = Array.from({ length: REQUESTS }, freshNonce)

    expect(new Set(nonces).size).toBe(REQUESTS)
  })

  it('does not create a nonce outside a request', () => {
    expect(requestNonce()).toBeUndefined()
  })
})
