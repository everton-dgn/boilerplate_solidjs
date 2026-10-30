import { createRequestEvent, type RequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'

import { applySecurityHeaders, securityHeaders } from '../index.ts'

const TEST_ORIGIN = 'http://localhost'
const HTTP_FOUND = 302
const NONCE = 'bm9uY2UtZGUtdGVzdGU='
const HTML_HEADERS = { 'content-type': 'text/html; charset=utf-8' }

const EXPECTED_HEADERS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'same-origin'
}

// applySecurityHeaders lê o nonce do evento da requisição.
function applyInRequest(response: Response): Response {
  const event: RequestEvent = createRequestEvent(new Request(TEST_ORIGIN))
  event.nonce = NONCE
  return provideRequestEvent(event, () => applySecurityHeaders(response))
}

// Diretivas da CSP por nome, sem depender da ordem.
function directives(response: Response): Record<string, string> {
  const policy = response.headers.get('content-security-policy') ?? ''
  return Object.fromEntries(
    policy.split('; ').map(directive => {
      const [name = '', ...values] = directive.split(' ')
      return [name, values.join(' ')]
    })
  )
}

describe('cabeçalhos de segurança da resposta', () => {
  beforeEach(() => {
    // A CSP só sai nos builds de produção; o Vitest roda com DEV.
    vi.stubEnv('DEV', false)
  })

  it('grava os cabeçalhos de segurança', () => {
    const response = applyInRequest(new Response('conteúdo'))

    expect(Object.fromEntries(response.headers)).toMatchObject(EXPECTED_HEADERS)
  })

  it('monta a CSP com o nonce e strict-dynamic, sem unsafe-inline em scripts e estilos', () => {
    const response = applyInRequest(
      new Response('<main>conteúdo</main>', { headers: HTML_HEADERS })
    )

    expect(directives(response)).toStrictEqual({
      'default-src': "'self'",
      'script-src': `'nonce-${NONCE}' 'strict-dynamic'`,
      'style-src': "'self'",
      'object-src': "'none'",
      'base-uri': "'self'",
      'form-action': "'self'",
      'frame-ancestors': "'none'"
    })
  })

  it('bloqueia todos os scripts quando o nonce de scripts está desativado', () => {
    const event: RequestEvent = createRequestEvent(new Request(TEST_ORIGIN))
    event.nonce = { script: false, style: false }

    const response = provideRequestEvent(event, () =>
      applySecurityHeaders(
        new Response('<main>conteúdo</main>', { headers: HTML_HEADERS })
      )
    )

    expect(directives(response)['script-src']).toBe("'none'")
  })

  // sitemap.xml, robots.txt e llms.txt têm s-maxage: um nonce na CSP ficaria
  // guardado no cache compartilhado.
  it.each([
    'text/plain; charset=utf-8',
    'application/xml; charset=utf-8',
    'text/markdown; charset=utf-8',
    'application/json',
    'text/html-sandboxed',
    'application/json; profile=text/html'
  ])('bloqueia scripts em resposta %s mesmo com nonce', contentType => {
    const response = applyInRequest(
      new Response('conteúdo', { headers: { 'content-type': contentType } })
    )

    expect(directives(response)['script-src']).toBe("'none'")
    expect(response.headers.get('content-security-policy')).not.toContain(NONCE)
  })

  it('reconhece o content-type HTML sem diferenciar maiúsculas', () => {
    const response = applyInRequest(
      new Response('<main>conteúdo</main>', {
        headers: { 'content-type': 'Text/HTML; charset=UTF-8' }
      })
    )

    expect(directives(response)['script-src']).toBe(
      `'nonce-${NONCE}' 'strict-dynamic'`
    )
  })

  it('omite a CSP em desenvolvimento e mantém os demais cabeçalhos', () => {
    vi.stubEnv('DEV', true)

    const response = applyInRequest(new Response('conteúdo'))

    expect(response.headers.has('content-security-policy')).toBe(false)
    expect(Object.fromEntries(response.headers)).toMatchObject(EXPECTED_HEADERS)
  })

  // Response.redirect() chega com headers imutáveis e sem corpo. Sem
  // documento, o redirect não executa scripts.
  it('grava os cabeçalhos e a CSP numa cópia de um redirect', () => {
    const response = applyInRequest(
      Response.redirect(new URL('/destino', TEST_ORIGIN), HTTP_FOUND)
    )

    expect({
      status: response.status,
      location: response.headers.get('location'),
      ...Object.fromEntries(response.headers)
    }).toMatchObject({
      status: HTTP_FOUND,
      location: `${TEST_ORIGIN}/destino`,
      ...EXPECTED_HEADERS
    })
    expect(directives(response)['script-src']).toBe("'none'")
  })
})

describe('cabeçalhos de segurança', () => {
  beforeEach(() => {
    // A CSP só sai nos builds de produção; o Vitest roda com DEV.
    vi.stubEnv('DEV', false)
  })

  it('adiciona os cabeçalhos de segurança à resposta', async () => {
    const response = new Response('conteúdo')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)

    await expect(securityHeaders(new Request(TEST_ORIGIN), next)).resolves.toBe(
      response
    )
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin'
    )
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  // O render lê o nonce do evento; ele precisa existir quando next() roda.
  it('cria o nonce antes do render e o usa na CSP', async () => {
    const event: RequestEvent = createRequestEvent(new Request(TEST_ORIGIN))
    let seen: unknown
    const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      seen = event.nonce
      return Promise.resolve(
        new Response('<main>página</main>', {
          headers: { 'content-type': 'text/html; charset=utf-8' }
        })
      )
    })

    const response = await provideRequestEvent(event, () =>
      securityHeaders(event.request, next)
    )

    assert(typeof seen === 'string')
    expect(response.headers.get('content-security-policy')).toContain(
      `script-src 'nonce-${seen}' 'strict-dynamic'`
    )
  })
})
