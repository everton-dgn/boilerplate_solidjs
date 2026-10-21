import { appendVary } from '../index.ts'

function withVary(vary: string | undefined): Response {
  return new Response(null, vary === undefined ? {} : { headers: { vary } })
}

describe('acréscimo de campos ao Vary', () => {
  it.each([
    [undefined, 'Accept', 'Accept'],
    ['', 'Accept', 'Accept'],
    ['Cookie', 'Accept', 'Cookie, Accept'],
    ['Accept-Language', 'Accept', 'Accept-Language, Accept'],
    ['Accept-Encoding', 'Cookie', 'Accept-Encoding, Cookie'],
    ['accept-encoding, cookie', 'Cookie', 'accept-encoding, cookie'],
    ['Cookie, Accept', 'Accept', 'Cookie, Accept'],
    ['Cookie,ACCEPT', 'Accept', 'Cookie,ACCEPT'],
    ['*', 'Accept', '*'],
    ['Cookie, *', 'Accept', 'Cookie, *'],
    ['Accept-Language', 'Language', 'Accept-Language, Language']
  ])('com Vary %j e campo %s resulta em %j', (vary, field, expected) => {
    const response = withVary(vary)

    expect(appendVary({ response, field })).toBe(response)
    expect(response.headers.get('vary')).toBe(expected)
  })
})
