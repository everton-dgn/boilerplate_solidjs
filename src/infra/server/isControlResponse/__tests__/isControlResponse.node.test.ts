import { redirect, reload } from '@solidjs/web'

import { isControlResponse } from '../index.ts'

const TEST_ORIGIN = 'http://localhost'
const HTTP_FOUND = 302

// Simula um objeto lançado cuja inspeção falha.
function hostileValue(): object {
  return new Proxy(
    {},
    {
      getPrototypeOf: () => {
        throw new Error('PRIVATE_PROTOTYPE')
      }
    }
  )
}

describe('classificação de respostas de controle', () => {
  it.each([
    ['o redirect do Solid', redirect('/')],
    ['o reload do Solid', reload()],
    ['um Response.redirect()', Response.redirect(TEST_ORIGIN, HTTP_FOUND)]
  ])('aceita %s, sem corpo', (_label, value) => {
    expect(isControlResponse(value)).toBe(true)
  })

  it.each([
    ['uma Response com corpo', new Response('PRIVATE')],
    ['uma Response.error(), com status 0', Response.error()],
    ['um Error', new Error('PRIVATE')],
    ['um objeto cuja inspeção falha', hostileValue()]
  ])('recusa %s', (_label, value) => {
    expect(isControlResponse(value)).toBe(false)
  })
})
