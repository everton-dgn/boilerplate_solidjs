import { isHtmlResponse } from '../index.ts'

function withType(contentType: string | undefined): Response {
  return new Response(
    null,
    contentType === undefined
      ? {}
      : { headers: { 'content-type': contentType } }
  )
}

describe('HTML response recognition', () => {
  it.each([
    'text/html',
    'text/html; charset=utf-8',
    'Text/HTML; charset=UTF-8',
    ' text/html ;charset=utf-8'
  ])('accepts %j', contentType => {
    expect(isHtmlResponse(withType(contentType))).toBe(true)
  })

  it.each([
    'text/html-sandboxed',
    'text/htmlx',
    'application/json; profile=text/html',
    'application/xhtml+xml',
    'text/plain; charset=utf-8',
    'text/markdown; charset=utf-8'
  ])('refuses %j', contentType => {
    expect(isHtmlResponse(withType(contentType))).toBe(false)
  })

  it('refuses a response without content-type', () => {
    expect(isHtmlResponse(new Response(null))).toBe(false)
  })
})
