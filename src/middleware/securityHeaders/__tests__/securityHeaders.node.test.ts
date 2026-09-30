import { securityHeaders } from '../index.ts'

const TEST_ORIGIN = 'http://localhost'

describe('cabeçalhos de segurança', () => {
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
})
