import { redirect, reload } from '@solidjs/web'

import { hostileValue } from '@/tests/helpers/failureValues/index.ts'

import { isControlResponse } from '../index.ts'

const TEST_ORIGIN = 'http://localhost'
const HTTP_FOUND = 302

describe('control response classification', () => {
  it.each([
    ['the Solid redirect', redirect('/')],
    ['the Solid reload', reload()],
    ['a Response.redirect()', Response.redirect(TEST_ORIGIN, HTTP_FOUND)]
  ])('accepts %s, without a body', (_label, value) => {
    expect(isControlResponse(value)).toBe(true)
  })

  it.each([
    ['a Response with a body', new Response('PRIVATE')],
    ['a Response.error(), with status 0', Response.error()],
    ['an Error', new Error('PRIVATE')],
    ['an object whose inspection fails', hostileValue()]
  ])('refuses %s', (_label, value) => {
    expect(isControlResponse(value)).toBe(false)
  })
})
